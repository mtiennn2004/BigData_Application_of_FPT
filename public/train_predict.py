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

N_DAYS_AHEAD = 10   # số phiên dự đoán tiếp theo
TEST_RATIO = 0.2    # 80/20

# -----------------------
# Utilities
# -----------------------
def norm_cols(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    df.columns = [c.strip() for c in df.columns]

    rename_map = {
        "close": "close",
        "date": "ngay",
        "volume": "kl",
        "change": "change",
        "open": "open"
    }

    for k, v in rename_map.items():
        if k in df.columns and v not in df.columns:
            df = df.rename(columns={k: v})

    return df


def parse_date(df: pd.DataFrame) -> pd.DataFrame:
    df = df.copy()
    if "ngay" in df.columns:
        df["ngay_dt"] = pd.to_datetime(df["ngay"], errors="coerce", dayfirst=True)
    else:
        df["ngay_dt"] = pd.NaT
    return df


def add_features(df: pd.DataFrame) -> pd.DataFrame:
    """
    Feature engineering tương tự ảnh bạn gửi.
    Target = close ngày tiếp theo.
    """
    df = df.copy()
    sort_key = "ngay_dt" if "ngay_dt" in df.columns and df["ngay_dt"].notna().any() else None
    if sort_key:
        df = df.sort_values(sort_key).reset_index(drop=True)

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

    # Volatility
    df["Volatility_20"] = df["Log_Return"].rolling(20).std()

    # Dist_MA50 (nếu bạn có dùng)
    df["Dist_MA50"] = df["close"] - df["MA50"]

    # Bollinger Bands
    df["BB_Upper"] = df["MA20"] + 2 * df["Volatility_20"]
    df["BB_Lower"] = df["MA20"] - 2 * df["Volatility_20"]

    # Target: ngày tiếp theo
    df["Target"] = df["close"].shift(-1)

    return df


def choose_feature_cols(df: pd.DataFrame) -> list[str]:
    """
    Tự chọn đúng số feature để tránh lỗi 13/14.
    Nếu Dist_MA50 toàn NaN (data ngắn hoặc không đủ MA50) thì bỏ nó.
    """
    base = [
        "kl", "Pct_ThayDoi", "Log_Return",
        "MA20", "MA50", "MA200",
        "Lag_1", "Lag_3", "Lag_5",
        "Momentum_5", "Volatility_20",
        "BB_Upper", "BB_Lower",
    ]
    # Dist_MA50 là feature thứ 14 theo ảnh bạn; thêm nếu usable
    if "Dist_MA50" in df.columns and df["Dist_MA50"].notna().sum() > 0:
        base.insert(-2, "Dist_MA50")  # chèn trước BB_Upper/BB_Lower
    return base


def row_to_feature_vector(history_df: pd.DataFrame, feature_cols: list[str]) -> np.ndarray:
    """
    Lấy row cuối cùng (đã có đủ feature) để predict Target (ngày tiếp theo).
    """
    last = history_df.iloc[-1]
    x = np.array([last[c] for c in feature_cols], dtype=float).reshape(1, -1)
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
        df["kl"] = 0

    df = add_features(df)

    feature_cols = choose_feature_cols(df)

    # cần đủ data để có MA200, vol20, ...
    df_train = df.dropna(subset=feature_cols + ["Target"]).reset_index(drop=True)
    if len(df_train) < 50:
        raise ValueError(
            "Data sau khi tạo feature bị quá ít. "
            "Bạn cần nhiều phiên hơn (đặc biệt nếu dùng MA200)."
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
    # Iterative forecast
    # -----------------------
    # Lấy lịch sử tới dòng cuối có đủ feature
    hist = df_train.copy()

    # ngày cuối để tạo mốc ngày tương lai (phiên - business day)
    last_dt = None
    if "ngay_dt" in df.columns and df["ngay_dt"].notna().any():
        last_dt = df["ngay_dt"].dropna().iloc[-1]

    future_dates = None
    if last_dt is not None:
        future_dates = pd.bdate_range(last_dt, periods=n_days_ahead + 1, inclusive="right")

    forecasts = []

    for i in range(n_days_ahead):
        # predict close ngày tiếp theo dựa trên row cuối
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

        # append "ngày mới" vào hist để dự đoán tiếp
        new_row = hist.iloc[-1].copy()
        new_row["close"] = next_close
        # volume giả lập: giữ volume cũ
        new_row["kl"] = float(new_row.get("kl", 0))

        # set date nếu có
        if future_dates is not None:
            new_row["ngay_dt"] = future_dates[i]

        # Sau khi set close, cần recompute features cho row mới
        # Cách đơn giản: rebuild features lại cho toàn hist+row mới (vì rolling)
        # Với N nhỏ (10) thì chạy nhanh.
        temp = pd.concat([hist[["ngay_dt","close","kl"]], pd.DataFrame([new_row[["ngay_dt","close","kl"]]])], ignore_index=True)

        # Chuẩn hoá cột để add_features dùng được
        temp = temp.rename(columns={"ngay_dt": "ngay_dt", "close": "close", "kl": "kl"})
        temp["ngay"] = temp["ngay_dt"].dt.strftime("%d/%m/%Y")

        temp = add_features(temp)
        temp = temp.dropna(subset=feature_cols).reset_index(drop=True)

        # hist mới là phần temp có đủ feature (giữ lại các cột cần)
        # (đảm bảo row cuối luôn có đủ feature để predict vòng sau)
        hist = temp.copy()

    with open(FORECAST_OUT, "w", encoding="utf-8") as f:
        json.dump(forecasts, f, ensure_ascii=False, indent=2)

    print(f"✅ Train metrics saved -> {METRICS_OUT}")
    print(f"✅ Forecast saved -> {FORECAST_OUT}")
    print(f"✅ Features used ({len(feature_cols)}): {feature_cols}")


if __name__ == "__main__":
    main(n_days_ahead=N_DAYS_AHEAD)
