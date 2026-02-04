import React, { useEffect, useMemo, useRef } from "react";
import { createChart, LineStyle, LineSeries } from "lightweight-charts";

function dmyToYmd(dmy) {
  // "dd/MM/yyyy" -> "yyyy-MM-dd"
  const [dd, mm, yyyy] = String(dmy).split("/").map((x) => x.trim());
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

// ✅ fallback: hỗ trợ cả API mới (addLineSeries) và API cũ (addSeries)
function addLine(chart, options) {
  if (typeof chart.addLineSeries === "function") return chart.addLineSeries(options);
  // API cũ
  return chart.addSeries(LineSeries, options);
}

export default function ForecastCloseChart({
  rows = [],
  forecast = [],
  symbol = "FPT",
  height = 260,
}) {
  const ref = useRef(null);

  const prepared = useMemo(() => {
    if (!Array.isArray(rows) || rows.length === 0) return null;

    // Past close
    const past = rows
      .filter((r) => r && r.date && r.close != null)
      .map((r) => ({
        time: dmyToYmd(r.date),
        value: Number(r.close),
      }))
      .filter((p) => Number.isFinite(p.value))
      .sort((a, b) => (a.time > b.time ? 1 : -1));

    if (past.length === 0) return null;

    // Forecast: [{date:'YYYY-MM-DD', predicted_close:number}, ...]
    const fut = (Array.isArray(forecast) ? forecast : [])
      .filter((d) => d && d.date && Number.isFinite(d.predicted_close))
      .map((d) => ({
        time: String(d.date),
        value: Number(d.predicted_close),
      }))
      .sort((a, b) => (a.time > b.time ? 1 : -1));

    // Anchor nối từ close cuối cùng sang forecast
    const last = past[past.length - 1];
    const forecastWithAnchor = fut.length ? [last, ...fut] : [];

    return { past, forecast: forecastWithAnchor };
  }, [rows, forecast]);

  useEffect(() => {
    if (!ref.current || !prepared) return;

    const chart = createChart(ref.current, {
      height,
      layout: {
        background: { type: "solid", color: "transparent" },
        textColor: "rgba(255,255,255,0.85)",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.06)" },
        horzLines: { color: "rgba(255,255,255,0.06)" },
      },
      rightPriceScale: { borderColor: "rgba(255,255,255,0.12)" },
      timeScale: { borderColor: "rgba(255,255,255,0.12)" },
      handleScroll: true,
      handleScale: true,
    });

    // Close quá khứ
    const pastSeries = addLine(chart, {
      color: "rgba(59,130,246,0.95)",
      lineWidth: 2,
      title: `${symbol} Close`,
    });
    pastSeries.setData(prepared.past);

    // Forecast tương lai (nét đứt)
    if (prepared.forecast.length) {
      const forecastSeries = addLine(chart, {
        color: "rgba(34,197,94,0.95)",
        lineWidth: 2,
        lineStyle: LineStyle.Dashed,
        title: `${symbol} Forecast`,
      });
      forecastSeries.setData(prepared.forecast);
    }

    chart.timeScale().fitContent();

    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        chart.applyOptions({ width: e.contentRect.width });
      }
    });
    ro.observe(ref.current);

    return () => {
      ro.disconnect();
      chart.remove();
    };
  }, [prepared, height, symbol]);

  if (!prepared) return null;

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: 700 }}>
          {symbol} · Close + Forecast
        </div>
      </div>

      <div
        ref={ref}
        style={{
          width: "100%",
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      />
    </div>
  );
}
