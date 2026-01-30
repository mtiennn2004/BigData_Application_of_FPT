// src/services/stockApi.js

const MINIO_CSV_URL =
  "http://52.64.32.78:9000/dantt.bucket1/Final_report/FPT_stock.json"; 
// Lưu ý: file của bạn là CSV text (dù đuôi .json)

function parseCSV(text) {
  const lines = text.trim().split(/\r?\n/);
  if (lines.length < 2) return [];

  const headers = lines[0].split(",").map((h) => h.trim());

  const rows = lines.slice(1).map((line) => {
    const cols = line.split(",").map((c) => c.trim());
    const obj = {};
    headers.forEach((h, i) => (obj[h] = cols[i]));

    // Parse số an toàn
    const toNum = (v) => {
      const n = Number(String(v ?? "").replaceAll(",", ""));
      return Number.isFinite(n) ? n : null;
    };

    const changeRaw = String(obj.change ?? "").trim(); // ví dụ: "1.6(1.53 %)" hoặc "-1.2(-0.8 %)"

    // Chuẩn hoá changeText để PriceCard bắt được up/down (startsWith + / -)
    let changeText = changeRaw;
    if (changeText && !changeText.startsWith("+") && !changeText.startsWith("-")) {
      const firstNum = Number(changeText.split("(")[0]);
      if (Number.isFinite(firstNum) && firstNum > 0) changeText = "+" + changeText;
      else if (Number.isFinite(firstNum) && firstNum < 0) changeText = changeText; // đã âm rồi
    }

    return {
      date: String(obj.date ?? "").trim(), // dd/mm/yyyy
      close: toNum(obj.close),
      open: toNum(obj.open),
      high: toNum(obj.high),
      low: toNum(obj.low),
      volume: toNum(obj.volume),
      changeText, // App đang dùng latest.changeText
    };
  });

  return rows.filter((r) => r.date); // bỏ dòng rác nếu có
}

// hash để App so sánh "New data" / "No change"
async function sha256Hex(str) {
  const enc = new TextEncoder().encode(str);
  const buf = await crypto.subtle.digest("SHA-256", enc);
  return [...new Uint8Array(buf)].map((b) => b.toString(16).padStart(2, "0")).join("");
}

/**
 * Trả về đúng shape mà App.jsx đang dùng:
 * { hash, data: { symbol, fetchedAt, rows, latest } }
 */
export async function fetchFptFromMinio() {
  const res = await fetch(MINIO_CSV_URL, { cache: "no-store" });
  if (!res.ok) throw new Error(`MinIO fetch failed: ${res.status} ${res.statusText}`);

  const text = await res.text();
  const rows = parseCSV(text);

  const hash = await sha256Hex(text);

  const data = {
    symbol: "FPT",
    fetchedAt: new Date().toISOString(),
    rows,                 // rows mới -> cũ (giữ nguyên như file)
    latest: rows[0] || null,
  };

  return { hash, data };
}
