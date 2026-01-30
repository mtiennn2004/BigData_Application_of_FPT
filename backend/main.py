from fastapi import FastAPI
from fastapi.middleware.cors import CORSMiddleware
from fastapi.responses import JSONResponse
import pandas as pd
import hashlib
from pathlib import Path
from datetime import datetime

app = FastAPI()

# Cho phép React/Vite gọi sang backend
app.add_middleware(
    CORSMiddleware,
    allow_origins=[
        "http://localhost:5173",
        "http://127.0.0.1:5173",
    ],
    allow_credentials=True,
    allow_methods=["*"],
    allow_headers=["*"],
)

XLSX_PATH = Path(__file__).resolve().parent / "Price_StockFpt.xlsx"


def file_hash_sha256(path: Path) -> str:
    b = path.read_bytes()
    return hashlib.sha256(b).hexdigest()


def to_float(x):
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return None
    # Excel có thể là "105.3" hoặc số
    s = str(x).strip().replace(",", "")
    try:
        return float(s)
    except:
        return None


def to_int(x):
    if x is None or (isinstance(x, float) and pd.isna(x)):
        return None
    s = str(x).strip().replace(",", "")
    try:
        return int(float(s))
    except:
        return None


def normalize_date(x) -> str:
    # Excel có thể là datetime hoặc string dd/mm/yyyy
    if isinstance(x, (datetime, pd.Timestamp)):
        return x.strftime("%d/%m/%Y")
    s = str(x).strip()
    # nếu là "2023-01-29 00:00:00" -> format lại
    try:
        dt = pd.to_datetime(s)
        return dt.strftime("%d/%m/%Y")
    except:
        return s


@app.get("/stock/fpt")
def stock_fpt():
    if not XLSX_PATH.exists():
        return JSONResponse(
            status_code=404,
            content={"error": f"Không tìm thấy file: {str(XLSX_PATH)}"},
        )

    # đọc excel
    df = pd.read_excel(XLSX_PATH, engine="openpyxl")

    # chuẩn hoá tên cột về lowercase cho chắc
    df.columns = [str(c).strip().lower() for c in df.columns]

    required = ["date", "close", "change", "volume", "open", "high", "low"]
    missing = [c for c in required if c not in df.columns]
    if missing:
        return JSONResponse(
            status_code=400,
            content={"error": f"Thiếu cột trong Excel: {missing}. Cần: {required}"},
        )

    # rows: mới -> cũ (trong ảnh excel bạn đang là mới->cũ), nhưng cứ sort theo date cho chắc
    df["_dt"] = pd.to_datetime(df["date"], errors="coerce", dayfirst=True)
    df = df.sort_values(by="_dt", ascending=False, na_position="last").drop(columns=["_dt"])

    rows = []
    for _, r in df.iterrows():
        rows.append(
            {
                "date": normalize_date(r["date"]),
                "close": to_float(r["close"]),
                "open": to_float(r["open"]),
                "high": to_float(r["high"]),
                "low": to_float(r["low"]),
                "volume": to_int(r["volume"]),
                # UI của bạn đang dùng latest.changeText
                "changeText": "" if pd.isna(r["change"]) else str(r["change"]).strip(),
            }
        )

    payload = {
        "symbol": "FPT",
        "fetchedAt": datetime.now().isoformat(),
        "rows": rows,
    }

    return {
        "updated": True,
        "hash": file_hash_sha256(XLSX_PATH),
        "data": payload,
    }
