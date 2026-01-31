// src/services/stockApi.js

/**
 * Đọc dữ liệu trực tiếp từ public/FPT_stock.json
 * (thực chất là CSV text)
 *
 * URL khi deploy:
 *   https://your-domain/FPT_stock.json
 */

const DATA_URL = "/FPT_stock.csv";

/**
 * Parse number an toàn
 */
function toNum(v) {
  if (v == null) return null;
  const s = String(v).trim().replaceAll(",", "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * dd/mm/yyyy -> yyyy-mm-dd (để sort)
 */
function dmyToYmd(dmy) {
  const s = String(dmy || "").trim();
  const p = s.split("/");
  if (p.length !== 3) return null;
  const [dd, mm, yyyy] = p;
  return `${yyyy}-${mm.padStart(2, "0")}-${dd.padStart(2, "0")}`;
}

/**
 * Parse CSV theo TÊN CỘT (không phụ thuộc thứ tự)
 * Header mong đợi:
 * date,close,change,volume,open,high,low
 */
function parseCSV(text) {
  if (!text) return [];

  const cleaned = text.replace(/^\uFEFF/, "").trim();
  const lines = cleaned.split(/\r?\n/).filter(Boolean);
  if (lines.length < 2) return [];

  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().toLowerCase());

  const idx = (name) => headers.indexOf(name);

  const iDate = idx("date");
  const iOpen = idx("open");
  const iHigh = idx("high");
  const iLow = idx("low");
  const iClose = idx("close");
  const iVolume = idx("volume");
  const iChange = idx("change");

  if (iDate < 0 || iOpen < 0 || iHigh < 0 || iLow < 0 || iClose < 0) {
    return [];
  }

  const rows = [];

  for (let i = 1; i < lines.length; i++) {
    const cols = lines[i].split(",").map((c) => c.trim());

    const date = cols[iDate];
    const ymd = dmyToYmd(date);

    const open = toNum(cols[iOpen]);
    const high = toNum(cols[iHigh]);
    const low = toNum(cols[iLow]);
    const close = toNum(cols[iClose]);
    const volume = iVolume >= 0 ? toNum(cols[iVolume]) : 0;

    if (!ymd || open == null || high == null || low == null || close == null) {
      continue;
    }

    let changeText = iChange >= 0 ? String(cols[iChange] ?? "").trim() : "";
    if (changeText && !changeText.startsWith("+") && !changeText.startsWith("-")) {
      const firstNum = Number(changeText.split("(")[0]);
      if (Number.isFinite(firstNum) && firstNum > 0) changeText = "+" + changeText;
    }

    rows.push({
      date,
      _ymd: ymd,
      open,
      high,
      low,
      close,
      volume: volume ?? 0,
      changeText,
    });
  }

  // Mới → cũ
  rows.sort((a, b) => (a._ymd < b._ymd ? 1 : -1));

  return rows.map(({ _ymd, ...r }) => r);
}

/**
 * Hash để App so sánh dữ liệu
 */
async function sha256Hex(str) {
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)]
    .map((b) => b.toString(16).padStart(2, "0"))
    .join("");
}

/**
 * API duy nhất frontend dùng
 */
export async function fetchFptFromMinio() {
  const res = await fetch(DATA_URL, { cache: "no-store" });
  if (!res.ok) throw new Error("Failed to load FPT_stock.json");

  const text = await res.text();
  const rows = parseCSV(text);
  const hash = await sha256Hex(text);

  return {
    hash,
    data: {
      symbol: "FPT",
      fetchedAt: new Date().toISOString(),
      rows,
      latest: rows[0] || null,
    },
  };
}
export async function fetchFptForecast() {
  const res = await fetch("/FPT_forecast.json", { cache: "no-store" });
  if (!res.ok) {
    throw new Error("Failed to load FPT_forecast.json");
  }

  const data = await res.json();

  // Chuẩn hoá & sort theo step (phòng trường hợp)
  return data
    .filter((d) => Number.isFinite(d.predicted_close))
    .sort((a, b) => a.step - b.step);
}