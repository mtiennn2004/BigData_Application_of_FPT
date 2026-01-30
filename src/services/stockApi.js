// src/services/stockApi.js

// NOTE: Frontend KHÔNG fetch trực tiếp MinIO (HTTP) khi deploy HTTPS.
// Ta dùng Vercel proxy: /api/fpt-data
const PROXY_URL = "/api/fpt-data.js";

/**
 * Parse number safely:
 * - remove commas
 * - handle empty / null
 */
function toNum(v) {
  if (v == null) return null;
  const s = String(v).trim().replaceAll(",", "");
  if (!s) return null;
  const n = Number(s);
  return Number.isFinite(n) ? n : null;
}

/**
 * Parse dd/mm/yyyy -> sortable key "yyyy-mm-dd"
 */
function dmyToYmd(dmy) {
  const s = String(dmy || "").trim();
  const parts = s.split("/");
  if (parts.length !== 3) return null;
  const [dd, mm, yyyy] = parts;
  if (!dd || !mm || !yyyy) return null;
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

/**
 * CSV parser robust:
 * - handle BOM
 * - handle empty lines
 * - map by header name (order independent)
 */
function parseCSV(text) {
  if (!text) return [];

  // Remove BOM if exists
  const cleaned = text.replace(/^\uFEFF/, "").trim();
  const lines = cleaned.split(/\r?\n/).filter((l) => l.trim().length > 0);
  if (lines.length < 2) return [];

  const headers = lines[0]
    .split(",")
    .map((h) => h.trim().toLowerCase());

  // Helper: get field by name (case-insensitive)
  const idxOf = (name) => headers.indexOf(name.toLowerCase());

  const iDate = idxOf("date");
  const iOpen = idxOf("open");
  const iHigh = idxOf("high");
  const iLow = idxOf("low");
  const iClose = idxOf("close");
  const iVolume = idxOf("volume");
  const iChange = idxOf("change");

  // Nếu thiếu cột chính, trả rỗng để UI biết lỗi schema
  if (iDate < 0 || iOpen < 0 || iHigh < 0 || iLow < 0 || iClose < 0) {
    return [];
  }

  const rows = [];

  for (let li = 1; li < lines.length; li++) {
    const cols = lines[li].split(",").map((c) => c.trim());

    const dateRaw = cols[iDate];
    const ymd = dmyToYmd(dateRaw);

    const open = toNum(cols[iOpen]);
    const high = toNum(cols[iHigh]);
    const low = toNum(cols[iLow]);
    const close = toNum(cols[iClose]);
    const volume = iVolume >= 0 ? toNum(cols[iVolume]) : null;

    // Validate essential OHLC
    if (!ymd || open == null || high == null || low == null || close == null) continue;

    // changeText: normalize +/-
    let changeText = iChange >= 0 ? String(cols[iChange] ?? "").trim() : "";
    if (changeText && !changeText.startsWith("+") && !changeText.startsWith("-")) {
      const firstNum = Number(changeText.split("(")[0]);
      if (Number.isFinite(firstNum) && firstNum > 0) changeText = "+" + changeText;
    }

    rows.push({
      date: String(dateRaw).trim(), // dd/mm/yyyy
      _ymd: ymd,                    // internal for sorting
      open,
      high,
      low,
      close,
      volume: volume ?? 0,
      changeText,
    });
  }

  // Sort newest -> oldest so latest = rows[0]
  rows.sort((a, b) => (a._ymd < b._ymd ? 1 : a._ymd > b._ymd ? -1 : 0));

  // remove internal field
  return rows.map(({ _ymd, ...rest }) => rest);
}

// hash để App so sánh "New data" / "No change"
async function sha256Hex(str) {
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Return shape expected by App.jsx:
 * { hash, data: { symbol, fetchedAt, rows, latest } }
 */
export async function fetchFptFromMinio() {
  const res = await fetch(PROXY_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`Proxy fetch failed: ${res.status} ${res.statusText}`);

  const text = await res.text();
  const rows = parseCSV(text);

  const hash = await sha256Hex(text);

  const data = {
    symbol: "FPT",
    fetchedAt: new Date().toISOString(),
    rows,
    latest: rows[0] || null,
  };

  return { hash, data };
}
