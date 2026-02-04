import React, { useCallback, useEffect, useMemo, useRef, useState } from "react";
import KpiBoard from "./components/KpiBoard.jsx";
import StockChart from "./components/StockChart.jsx";
import { fetchFptFromMinio, fetchFptForecast } from "./services/stockApi.js";

function fmtNumber(n) {
  if (n === null || n === undefined || Number.isNaN(n)) return "—";
  return new Intl.NumberFormat("vi-VN").format(n);
}

function PriceCard({ symbol, latest }) {
  if (!latest) {
    return (
      <div className="card">
        <div className="card-title">
          <span>Summary</span>
        </div>
        <div className="muted">Chưa có dữ liệu.</div>
      </div>
    );
  }

  const change = (latest.changeText || "").trim();
  const isUp = change.startsWith("+");
  const isDown = change.startsWith("-");
  const badgeCls = isUp ? "up" : isDown ? "down" : "flat";

  return (
    <div className="card">
      <div className="card-title">
        <span>Summary • {symbol || "—"}</span>
        <span className={`badge ${badgeCls}`}>{change || "—"}</span>
      </div>

      <div className="kpi">
        <div>
          <div className="kpi-label">Đóng cửa</div>
          <div className="kpi-value">{fmtNumber(latest.close)}</div>
        </div>
      </div>

      <div className="kpi-grid">
        <div className="kpi-item">
          <div className="kpi-label">Ngày</div>
          <div className="val">{latest.date || "—"}</div>
        </div>
        <div className="kpi-item">
          <div className="kpi-label">Khối lượng</div>
          <div className="val">{fmtNumber(latest.volume)}</div>
        </div>
        <div className="kpi-item">
          <div className="kpi-label">Mở cửa</div>
          <div className="val">{fmtNumber(latest.open)}</div>
        </div>
        <div className="kpi-item">
          <div className="kpi-label">Cao nhất</div>
          <div className="val">{fmtNumber(latest.high)}</div>
        </div>
        <div className="kpi-item">
          <div className="kpi-label">Thấp nhất</div>
          <div className="val">{fmtNumber(latest.low)}</div>
        </div>
        <div className="kpi-item">
          <div className="kpi-label">Close (raw)</div>
          <div className="val">{latest.close ?? "—"}</div>
        </div>
      </div>
    </div>
  );
}

function InfoCard({ fetchedAt, rowsCount, hash }) {
  return (
    <div className="card">
      <div className="card-title">
        <span>Thông tin</span>
      </div>
      <div className="muted">• Auto fetch khi mở trang, focus và mỗi 60s</div>

      <div className="kpi-grid" style={{ marginTop: 12 }}>
        <div className="kpi-item">
          <div className="kpi-label">FetchedAt</div>
          <div className="val">
            {fetchedAt ? new Date(fetchedAt).toLocaleString() : "—"}
          </div>
        </div>
        <div className="kpi-item">
          <div className="kpi-label">Số phiên</div>
          <div className="val">{rowsCount ?? "—"}</div>
        </div>
        <div className="kpi-item" style={{ gridColumn: "1 / -1" }}>
          <div className="kpi-label">Hash</div>
          <div className="val" style={{ wordBreak: "break-all" }}>
            {hash || "—"}
          </div>
        </div>
      </div>
    </div>
  );
}

function filterRowsByRange(rows, range) {
  if (!rows?.length) return [];
  if (range === "5Y") return rows;

  const daysMap = { "1M": 31, "6M": 183, "1Y": 366 };
  const days = daysMap[range] || 366;

  const parseDateVN = (s) => {
    const [d, m, y] = (s || "").split("/").map(Number);
    if (!d || !m || !y) return null;
    return new Date(y, m - 1, d);
  };

  const newest = parseDateVN(rows[0]?.date);
  if (!newest) return rows;

  const cutoff = new Date(newest);
  cutoff.setDate(cutoff.getDate() - days);

  return rows.filter((r) => {
    const dt = parseDateVN(r.date);
    return dt && dt >= cutoff;
  });
}

function filterRowsByDateRange(rows, fromYmd, toYmd) {
  if (!rows?.length) return [];

  const dmyToTs = (s) => {
    const [d, m, y] = (s || "").split("/").map(Number);
    if (!d || !m || !y) return null;
    return new Date(y, m - 1, d).getTime();
  };

  const fromTs = fromYmd ? new Date(fromYmd).getTime() : null; // yyyy-mm-dd
  const toTs = toYmd ? new Date(toYmd).getTime() : null;

  return rows.filter((r) => {
    const ts = dmyToTs(r.date);
    if (!ts) return false;
    if (fromTs != null && ts < fromTs) return false;
    if (toTs != null && ts > toTs) return false;
    return true;
  });
}

function ForecastCard({ forecast, onRefreshForecast }) {
  return (
    <div className="card">
      <div className="card-title">
        <span>Dự đoán giá (Linear Regression)</span>
        <button className="btn" onClick={onRefreshForecast}>
          Reload
        </button>
      </div>

      {!forecast ? (
        <div className="muted">
          Chưa có forecast. Hãy chạy <code>python public/train_predict.py</code> để
          tạo <code>public/FPT_forecast.json</code>.
        </div>
      ) : forecast.length === 0 ? (
        <div className="muted">Forecast rỗng.</div>
      ) : (
        <table className="table">
          <thead>
            <tr>
              <th>Phiên</th>
              <th>Ngày</th>
              <th className="right-align">Close (dự đoán)</th>
            </tr>
          </thead>
          <tbody>
            {forecast.map((f, idx) => (
              <tr key={f.step ?? `${f.date ?? "na"}-${idx}`}>
                <td>{f.step ?? idx + 1}</td>
                <td>{f.date ?? "—"}</td>
                <td className="right-align">
                  <b>{fmtNumber(f.predicted_close)}</b>
                </td>
              </tr>
            ))}
          </tbody>
        </table>
      )}
    </div>
  );
}

export default function App() {
  const [payload, setPayload] = useState(null);
  const [status, setStatus] = useState({ loading: true, error: null, updated: null });
  const [range, setRange] = useState("1Y");

  // date range picker (yyyy-mm-dd)
  const [fromDate, setFromDate] = useState("");
  const [toDate, setToDate] = useState("");

  // forecast
  const [forecast, setForecast] = useState(null);
  const [forecastError, setForecastError] = useState(null);

  const lastHashRef = useRef(null);

  const loadForecast = useCallback(async () => {
    try {
      setForecastError(null);
      const data = await fetchFptForecast();
      setForecast(Array.isArray(data) ? data : []);
    } catch (e) {
      setForecast(null);
      setForecastError(String(e));
    }
  }, []);

  const refresh = useCallback(async () => {
    try {
      const res = await fetchFptFromMinio();

      if (!lastHashRef.current || res.hash !== lastHashRef.current) {
        lastHashRef.current = res.hash;
        setPayload(res.data);
        setStatus({ loading: false, error: null, updated: true });
      } else {
        setStatus({ loading: false, error: null, updated: false });
      }

      // ✅ refresh luôn forecast cùng lúc (đủ rồi, không cần useEffect loadForecast riêng)
      await loadForecast();
    } catch (e) {
      setStatus({ loading: false, error: String(e), updated: null });
    }
  }, [loadForecast]);

  useEffect(() => {
    refresh();
  }, [refresh]);

  useEffect(() => {
    const t = setInterval(refresh, 60000);
    const onFocus = () => refresh();
    const onVis = () => {
      if (document.visibilityState === "visible") refresh();
    };

    window.addEventListener("focus", onFocus);
    document.addEventListener("visibilitychange", onVis);

    return () => {
      clearInterval(t);
      window.removeEventListener("focus", onFocus);
      document.removeEventListener("visibilitychange", onVis);
    };
  }, [refresh]);

  const chartRows = useMemo(() => {
    const base = payload?.rows || [];
    if (fromDate || toDate) return filterRowsByDateRange(base, fromDate, toDate);
    return filterRowsByRange(base, range);
  }, [payload, range, fromDate, toDate]);

  const latest20 = useMemo(() => {
    const base = payload?.rows || [];
    const filtered = fromDate || toDate ? filterRowsByDateRange(base, fromDate, toDate) : base;
    return filtered.slice(0, 20);
  }, [payload, fromDate, toDate]);

  const pillText = status.updated === null ? "—" : status.updated ? "New data" : "No change";

  return (
    <div className="dashboard">
      <div className="topbar">
        <div>
          <div className="title">Stock Dashboard</div>
          <div className="subtitle">
            {payload?.symbol ? `Mã: ${payload.symbol}` : "—"} •{" "}
            {payload?.fetchedAt
              ? `Updated: ${new Date(payload.fetchedAt).toLocaleString()}`
              : "Chưa có dữ liệu"}
          </div>
        </div>

        <div className="actions">
          <div className="pill">{pillText}</div>
          <button className="btn" onClick={refresh}>
            Refresh
          </button>
        </div>
      </div>

      {status.error && (
        <div className="card" style={{ borderColor: "rgba(239,68,68,.35)" }}>
          <div className="card-title">
            <span>Lỗi</span>
          </div>
          <div className="muted" style={{ color: "#fecaca" }}>
            {status.error}
          </div>
        </div>
      )}

      {forecastError && (
        <div className="card" style={{ borderColor: "rgba(239,68,68,.35)" }}>
          <div className="card-title">
            <span>Lỗi forecast</span>
          </div>
          <div className="muted" style={{ color: "#fecaca" }}>
            {forecastError}
          </div>
          <div className="muted" style={{ marginTop: 8 }}>
            Hãy chạy: <code>python public/train_predict.py</code> để tạo{" "}
            <code>public/FPT_forecast.json</code>
          </div>
        </div>
      )}

      {!payload ? (
        <div className="card">
          <div className="card-title">
            <span>Loading…</span>
          </div>
          <div className="muted">Đang tải dữ liệu…</div>
        </div>
      ) : (
        <div className="grid">
          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <PriceCard symbol={payload.symbol} latest={payload.latest} />
            {payload?.rows?.length ? <KpiBoard rows={payload.rows} /> : null}
            <ForecastCard forecast={forecast} onRefreshForecast={loadForecast} />
            <InfoCard
              fetchedAt={payload.fetchedAt}
              rowsCount={payload.rows?.length}
              hash={lastHashRef.current}
            />
          </div>

          <div style={{ display: "flex", flexDirection: "column", gap: 16 }}>
            <div className="card">
              <div className="card-title">
                <span>Biểu đồ</span>
                <div className="chips">
                  {["1M", "6M", "1Y", "5Y"].map((k) => (
                    <button
                      key={k}
                      className={"chip " + (range === k ? "active" : "")}
                      onClick={() => {
                        setRange(k);
                        setFromDate("");
                        setToDate("");
                      }}
                    >
                      {k}
                    </button>
                  ))}
                </div>
              </div>

              <div
                style={{
                  display: "flex",
                  gap: 8,
                  alignItems: "center",
                  marginTop: 10,
                  flexWrap: "wrap",
                }}
              >
                <div className="muted">Tùy chọn:</div>

                <input
                  type="date"
                  value={fromDate}
                  onChange={(e) => setFromDate(e.target.value)}
                  className="input"
                />
                <span className="muted">→</span>
                <input
                  type="date"
                  value={toDate}
                  onChange={(e) => setToDate(e.target.value)}
                  className="input"
                />

                <button
                  className="btn"
                  onClick={() => {
                    setFromDate("");
                    setToDate("");
                  }}
                >
                  Clear
                </button>
              </div>

              <StockChart
                rows={chartRows}
                forecast={forecast || []}
                symbol={payload?.symbol || "FPT"}
              />
            </div>

            <div className="card">
              <div className="card-title">
                <span>20 phiên gần nhất</span>
              </div>
              <table className="table">
                <thead>
                  <tr>
                    <th>Ngày</th>
                    <th className="right-align">Open</th>
                    <th className="right-align">High</th>
                    <th className="right-align">Low</th>
                    <th className="right-align">Close</th>
                    <th className="right-align">Volume</th>
                  </tr>
                </thead>
                <tbody>
                  {latest20.map((r) => (
                    <tr key={r.date}>
                      <td>{r.date}</td>
                      <td className="right-align">{fmtNumber(r.open)}</td>
                      <td className="right-align">{fmtNumber(r.high)}</td>
                      <td className="right-align">{fmtNumber(r.low)}</td>
                      <td className="right-align">
                        <b>{fmtNumber(r.close)}</b>
                      </td>
                      <td className="right-align">{fmtNumber(r.volume)}</td>
                    </tr>
                  ))}
                </tbody>
              </table>

              {(fromDate || toDate) && (
                <div className="muted" style={{ marginTop: 10 }}>
                  Đang lọc theo khoảng: <b>{fromDate || "—"}</b> →{" "}
                  <b>{toDate || "—"}</b>
                </div>
              )}
            </div>
          </div>
        </div>
      )}
    </div>
  );
}
