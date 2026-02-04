import os
import json
import numpy as np
import pandas as pd

from sklearn.linear_model import LinearRegression
from sklearn.preprocessing import StandardScaler
from sklearn.pipeline import Pipeline
from sklearn.metrics import mean_squared_error, r2_score

# -----------------------
# Config
# -----------------------
CSV_PATH = os.path.join("public", "FPT_stock.csv")
FORECAST_OUT = os.path.join("public", "FPT_forecast.json")
METRICS_OUT = os.path.join("public", "FPT_train_metrics.json")

N_DAYS_AHEAD = 30   # ✅ số phiên dự đoán tiếp theo
TEST_RATIO = 0.2    # 80/20


# -----------------------
# Utilities
# -----------------------
def norm_cols(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [c.strip() for c in df.columns]

    # Chuẩn hoá các tên cột phổ biến về đúng schema bạn dùng
    rename_map = {
        "date": "ngay",
        "close": "close",
        "open": "open",
        "high": "high",
        "low": "low",
        "volume": "kl",
        "kl": "kl",
    }

    for src, dst in rename_map.items():
        if src in df.columns and dst not in df.columns:
            df = df.rename(columns={src: dst})

    return df


def parse_date(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    if "ngay" in df.columns:
        # dữ liệu dạng dd/mm/yyyy
        df["ngay_dt"] = pd.to_datetime(df["ngay"], errors="coerce", dayfirst=True)
    else:
        df["ngay_dt"] = pd.NaT
    return df


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Feature engineering.
    Target = close ngày tiếp theo.
    """
    df = df.copy()

    # đảm bảo có close + kl
    if "close" not in df.columns:
        raise ValueError("Thiếu cột 'close' để tạo features.")
    if "kl" not in df.columns:
        df["kl"] = 0.0

    # sort theo ngày nếu có
    if "ngay_dt" in df.columns and df["ngay_dt"].notna().any():
        df = df.sort_values("ngay_dt").reset_index(drop=True)

    # Returns
    df["Pct_ThayDoi"] = df["close"].pct_change()
    df["Log_Return"] = np.log(df["close"] / df["close"].shift(1))

    # MAs
    df["MA20"] = df["close"].rolling(20).mean()
    df["MA50"] = df["close"].rolling(50).mean()
    df["MA200"] = df["close"].rolling(200).mean()

    # Lags
    df["Lag_1"] = df["close"].shift(1)
    df["Lag_3"] = df["close"].shift(3)
    df["Lag_5"] = df["close"].shift(5)

    # Momentum
    df["Momentum_5"] = df["close"] - df["close"].shift(5)

    # Volatility (log return std) - vẫn giữ làm feature
    df["Volatility_20"] = df["Log_Return"].rolling(20).std()

    # Dist_MA50
    df["Dist_MA50"] = df["close"] - df["MA50"]

    # ✅ Bollinger chuẩn: dùng STD20 của CLOSE (đúng đơn vị giá)
    df["STD20"] = df["close"].rolling(20).std()
    df["BB_Upper"] = df["MA20"] + 2 * df["STD20"]
    df["BB_Lower"] = df["MA20"] - 2 * df["STD20"]

    # Target: ngày tiếp theo
    df["Target"] = df["close"].shift(-1)

    return df


def choose_feature_cols(df: pd.DataFrame) -> list[str]:
    base = [
        "kl",
        "Pct_ThayDoi",
        "Log_Return",
        "MA20",
        "MA50",
        # "MA200",  # ❌ bỏ để forecast xa ổn định
        "Lag_1",
        "Lag_3",
        "Lag_5",
        "Momentum_5",
        "Volatility_20",
        "BB_Upper",
        "BB_Lower",
    ]

    if "Dist_MA50" in df.columns and df["Dist_MA50"].notna().sum() > 0:
        base.insert(-2, "Dist_MA50")

    base = [c for c in base if c in df.columns]
    return base


def row_to_feature_vector(history_df: pd.DataFrame, feature_cols: list[str]) -> pd.DataFrame:
    """
    Lấy row cuối cùng (đã có đủ feature) => trả về DataFrame 1 hàng có feature names
    để không bị warning của sklearn.
    """
    if history_df is None or len(history_df) == 0:
        raise ValueError("history_df rỗng, không thể predict.")

    last = history_df.iloc[-1]
    x = pd.DataFrame([[float(last[c]) for c in feature_cols]], columns=feature_cols)
    return x


# -----------------------
# Main
# -----------------------
def main(n_days_ahead: int = N_DAYS_AHEAD):
    if not os.path.exists(CSV_PATH):
        raise FileNotFoundError(f"Không thấy file: {CSV_PATH}")

    df = pd.read_csv(CSV_PATH)
    df = norm_cols(df)
    df = parse_date(df)

    if "close" not in df.columns:
        raise ValueError(f"CSV thiếu cột close. Các cột hiện có: {list(df.columns)}")

    if "kl" not in df.columns:
        df["kl"] = 0.0

    df = add_features(df)
    feature_cols = choose_feature_cols(df)

    # cần đủ data để có MA200, vol20, ...
    df_train = df.dropna(subset=feature_cols + ["Target"]).reset_index(drop=True)
    if len(df_train) < 50:
        raise ValueError(
            "Data sau khi tạo feature bị quá ít. "
            "Bạn cần nhiều phiên hơn (đặc biệt nếu dùng MA200/rolling)."
        )

    X = df_train[feature_cols]
    y = df_train["Target"]

    split = int(len(df_train) * (1 - TEST_RATIO))
    X_train, X_test = X.iloc[:split], X.iloc[split:]
    y_train, y_test = y.iloc[:split], y.iloc[split:]

    model = Pipeline([
        ("scaler", StandardScaler()),
        ("lr", LinearRegression()),
    ])
    model.fit(X_train, y_train)

    # evaluate
    y_pred_test = model.predict(X_test)
    rmse = float(np.sqrt(mean_squared_error(y_test, y_pred_test)))
    r2 = float(r2_score(y_test, y_pred_test))

    with open(METRICS_OUT, "w", encoding="utf-8") as f:
        json.dump(
            {
                "n_rows_raw": int(len(df)),
                "n_rows_trainable": int(len(df_train)),
                "features_used": feature_cols,
                "test_ratio": TEST_RATIO,
                "rmse": rmse,
                "r2": r2,
            },
            f,
            ensure_ascii=False,
            indent=2,
        )

    # -----------------------
    # Iterative forecast (an toàn, không làm hist rỗng)
    # -----------------------
    # Hist dùng để predict: phải là df đã có feature đầy đủ
    hist = df_train.copy()

    # ngày cuối để tạo mốc ngày tương lai (business day)
    last_dt = None
    if "ngay_dt" in df.columns and df["ngay_dt"].notna().any():
        last_dt = df["ngay_dt"].dropna().iloc[-1]

    future_dates = None
    if last_dt is not None:
        # +1 .. +n business days
        future_dates = pd.bdate_range(last_dt, periods=n_days_ahead + 1, inclusive="right")

    forecasts = []

    for i in range(n_days_ahead):
        # predict close ngày tiếp theo dựa trên row cuối có đủ feature
        x = row_to_feature_vector(hist, feature_cols)
        next_close = float(model.predict(x)[0])

        out_date = None
        if future_dates is not None:
            out_date = future_dates[i].strftime("%Y-%m-%d")

        forecasts.append({
            "step": i + 1,
            "date": out_date,
            "predicted_close": next_close
        })

        # --- cập nhật lịch sử close để dự đoán bước tiếp theo ---
        # lấy lịch sử nền chỉ gồm ngay_dt, close, kl
        base_hist = hist[["ngay_dt", "close", "kl"]].copy()

        new_dt = future_dates[i] if future_dates is not None else pd.NaT
        last_kl = float(base_hist["kl"].iloc[-1]) if len(base_hist) else 0.0

        new_point = pd.DataFrame([{
            "ngay_dt": new_dt,
            "close": next_close,
            "kl": last_kl
        }])

        base_hist = pd.concat([base_hist, new_point], ignore_index=True)

        # tạo ngay dạng dd/mm/yyyy để add_features dùng
        base_hist["ngay"] = base_hist["ngay_dt"].dt.strftime("%d/%m/%Y")

        # tính lại feature trên toàn lịch sử
        temp = add_features(base_hist)

        # chỉ lấy row đủ feature để predict vòng sau
        temp = temp.dropna(subset=feature_cols).reset_index(drop=True)

        if len(temp) == 0:
            raise RuntimeError(
                "Forecast bị rỗng sau khi dropna(feature). "
                "Giảm bớt rolling feature (MA200) hoặc tăng dữ liệu lịch sử."
            )

        hist = temp.copy()

    with open(FORECAST_OUT, "w", encoding="utf-8") as f:
        json.dump(forecasts, f, ensure_ascii=False, indent=2)

    print(f"✅ Train metrics saved -> {METRICS_OUT}")
    print(f"✅ Forecast saved -> {FORECAST_OUT}")
    print(f"✅ Features used ({len(feature_cols)}): {feature_cols}")
    print(f"✅ Forecast steps: {n_days_ahead}")


if __name__ == "__main__":
    main(n_days_ahead=N_DAYS_AHEAD)
