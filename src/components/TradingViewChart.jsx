import React, { useEffect, useMemo, useRef, useState } from "react";
import {
  createChart,
  CrosshairMode,
  // v5+ (typed series)
  CandlestickSeries,
  LineSeries,
  HistogramSeries,
} from "lightweight-charts";

/**
 * Expected rows format (from your MinIO fetch):
 * [{ date:"dd/mm/yyyy", open, high, low, close, volume, ... }, ...]
 * rows may be newest-first -> we sort ascending by date.
 */

function dmyToYmd(dmy) {
  // "dd/mm/yyyy" -> "yyyy-mm-dd" (lightweight-charts time: 'YYYY-MM-DD')
  const [dd, mm, yyyy] = String(dmy).split("/").map((x) => x.trim());
  return `${yyyy}-${String(mm).padStart(2, "0")}-${String(dd).padStart(2, "0")}`;
}

function sma(values, period) {
  const out = new Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

function ema(values, period) {
  const out = new Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = null;
  for (let i = 0; i < values.length; i++) {
    const v = values[i];
    if (prev === null) {
      prev = v;
      out[i] = v;
    } else {
      prev = v * k + prev * (1 - k);
      out[i] = prev;
    }
  }
  // match common plotting: first period-1 null
  for (let i = 0; i < period - 1 && i < out.length; i++) out[i] = null;
  return out;
}

function rsi(closes, period = 14) {
  const out = new Array(closes.length).fill(null);
  if (closes.length <= period) return out;

  let gain = 0;
  let loss = 0;

  for (let i = 1; i <= period; i++) {
    const ch = closes[i] - closes[i - 1];
    if (ch >= 0) gain += ch;
    else loss -= ch;
  }

  let avgGain = gain / period;
  let avgLoss = loss / period;

  out[period] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);

  for (let i = period + 1; i < closes.length; i++) {
    const ch = closes[i] - closes[i - 1];
    const g = ch > 0 ? ch : 0;
    const l = ch < 0 ? -ch : 0;
    avgGain = (avgGain * (period - 1) + g) / period;
    avgLoss = (avgLoss * (period - 1) + l) / period;
    out[i] = avgLoss === 0 ? 100 : 100 - 100 / (1 + avgGain / avgLoss);
  }

  return out;
}

function macd(closes, fast = 12, slow = 26, signal = 9) {
  const fastE = ema(closes, fast);
  const slowE = ema(closes, slow);

  const macdLine = closes.map((_, i) =>
    fastE[i] == null || slowE[i] == null ? null : fastE[i] - slowE[i]
  );

  // For EMA signal, forward-fill nulls into the EMA input
  const filled = [];
  let last = 0;
  for (let i = 0; i < macdLine.length; i++) {
    const v = macdLine[i];
    if (v == null) filled.push(last);
    else {
      last = v;
      filled.push(v);
    }
  }

  const signalLine = ema(filled, signal).map((v, i) =>
    macdLine[i] == null ? null : v
  );

  const hist = macdLine.map((v, i) =>
    v == null || signalLine[i] == null ? null : v - signalLine[i]
  );

  return { macdLine, signalLine, hist };
}

/**
 * Add series helper (supports both v4 and v5+)
 */
function addCandles(chart, options) {
  if (typeof chart.addCandlestickSeries === "function") {
    return chart.addCandlestickSeries(options);
  }
  // v5+:
  return chart.addSeries(CandlestickSeries, options);
}

function addLine(chart, options) {
  if (typeof chart.addLineSeries === "function") {
    return chart.addLineSeries(options);
  }
  // v5+:
  return chart.addSeries(LineSeries, options);
}

function addHistogram(chart, options) {
  if (typeof chart.addHistogramSeries === "function") {
    return chart.addHistogramSeries(options);
  }
  // v5+:
  return chart.addSeries(HistogramSeries, options);
}

export default function TradingViewChart({
  rows,
  symbol = "FPT",
  mainHeight = 520,
  showSMA = true,
  showEMA = true,
  smaPeriod = 20,
  emaPeriod = 20,
}) {
  const mainRef = useRef(null);
  const rsiRef = useRef(null);
  const macdRef = useRef(null);

  const [ready, setReady] = useState(false);

  const prepared = useMemo(() => {
    if (!rows || rows.length === 0) return null;

    const sorted = [...rows]
      .filter((r) => r && r.date)
      .map((r) => ({
        ...r,
        _time: dmyToYmd(r.date),
      }))
      .sort((a, b) => (a._time > b._time ? 1 : -1));

    const candles = sorted.map((r) => ({
      time: r._time,
      open: Number(r.open),
      high: Number(r.high),
      low: Number(r.low),
      close: Number(r.close),
    }));

    const volumes = sorted.map((r, i) => ({
      time: r._time,
      value: Number(r.volume) || 0,
      isUp: Number(r.close) >= Number(r.open),
      idx: i,
    }));

    const closes = sorted.map((r) => Number(r.close));
    const smaArr = sma(closes, smaPeriod);
    const emaArr = ema(closes, emaPeriod);
    const rsiArr = rsi(closes, 14);
    const { macdLine, signalLine, hist } = macd(closes, 12, 26, 9);

    const mkSeries = (arr) =>
      sorted
        .map((r, i) => ({ time: r._time, value: arr[i] }))
        .filter((p) => p.value != null);

    return {
      candles,
      volumes,
      smaSeries: mkSeries(smaArr),
      emaSeries: mkSeries(emaArr),
      rsiSeries: mkSeries(rsiArr),
      macdSeries: mkSeries(macdLine),
      signalSeries: mkSeries(signalLine),
      histSeries: mkSeries(hist),
    };
  }, [rows, smaPeriod, emaPeriod]);

  useEffect(() => {
    if (!mainRef.current || !rsiRef.current || !macdRef.current || !prepared) return;

    // --- Main chart ---
    const mainChart = createChart(mainRef.current, {
      height: mainHeight,
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
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: true,
      handleScale: true,
    });

    const candleSeries = addCandles(mainChart, {
      upColor: "#22c55e",
      downColor: "#ef4444",
      borderVisible: false,
      wickUpColor: "#22c55e",
      wickDownColor: "#ef4444",
    });
    candleSeries.setData(prepared.candles);

    const volumeSeries = addHistogram(mainChart, {
      priceFormat: { type: "volume" },
      priceScaleId: "",
      scaleMargins: { top: 0.8, bottom: 0 },
    });
    volumeSeries.setData(
      prepared.volumes.map((v) => ({
        time: v.time,
        value: v.value,
        color: v.isUp ? "rgba(34,197,94,0.35)" : "rgba(239,68,68,0.35)",
      }))
    );

    let smaLine = null;
    if (showSMA) {
      smaLine = addLine(mainChart, {
        color: "rgba(59,130,246,0.95)",
        lineWidth: 2,
      });
      smaLine.setData(prepared.smaSeries);
    }

    let emaLine = null;
    if (showEMA) {
      emaLine = addLine(mainChart, {
        color: "rgba(245,158,11,0.95)",
        lineWidth: 2,
      });
      emaLine.setData(prepared.emaSeries);
    }

    mainChart.timeScale().fitContent();

    // --- RSI chart ---
    const rsiChart = createChart(rsiRef.current, {
      height: 140,
      layout: {
        background: { type: "solid", color: "transparent" },
        textColor: "rgba(255,255,255,0.75)",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.05)" },
        horzLines: { color: "rgba(255,255,255,0.05)" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.10)",
        scaleMargins: { top: 0.2, bottom: 0.2 },
      },
      timeScale: { visible: false },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: true,
      handleScale: true,
    });

    const rsiLine = addLine(rsiChart, {
      color: "rgba(168,85,247,0.95)",
      lineWidth: 2,
    });
    rsiLine.setData(prepared.rsiSeries);

    // RSI 70/30 reference
    const rsi70 = addLine(rsiChart, { color: "rgba(255,255,255,0.25)", lineWidth: 1 });
    const rsi30 = addLine(rsiChart, { color: "rgba(255,255,255,0.25)", lineWidth: 1 });
    const times = prepared.rsiSeries.map((p) => p.time);
    if (times.length) {
      rsi70.setData(times.map((t) => ({ time: t, value: 70 })));
      rsi30.setData(times.map((t) => ({ time: t, value: 30 })));
    }

    // --- MACD chart ---
    const macdChart = createChart(macdRef.current, {
      height: 170,
      layout: {
        background: { type: "solid", color: "transparent" },
        textColor: "rgba(255,255,255,0.75)",
      },
      grid: {
        vertLines: { color: "rgba(255,255,255,0.05)" },
        horzLines: { color: "rgba(255,255,255,0.05)" },
      },
      rightPriceScale: {
        borderColor: "rgba(255,255,255,0.10)",
        scaleMargins: { top: 0.15, bottom: 0.15 },
      },
      timeScale: { visible: false },
      crosshair: { mode: CrosshairMode.Normal },
      handleScroll: true,
      handleScale: true,
    });

    const histSeries = addHistogram(macdChart, {
      priceScaleId: "",
      scaleMargins: { top: 0.15, bottom: 0.15 },
    });
    histSeries.setData(
      prepared.histSeries.map((p) => ({
        ...p,
        color: p.value >= 0 ? "rgba(34,197,94,0.55)" : "rgba(239,68,68,0.55)",
      }))
    );

    const macdLine = addLine(macdChart, {
      color: "rgba(59,130,246,0.95)",
      lineWidth: 2,
    });
    macdLine.setData(prepared.macdSeries);

    const signalLineS = addLine(macdChart, {
      color: "rgba(245,158,11,0.95)",
      lineWidth: 2,
    });
    signalLineS.setData(prepared.signalSeries);

    // --- Sync time range across charts ---
    const sync = (source, targets) => {
      source.timeScale().subscribeVisibleTimeRangeChange((range) => {
        if (!range) return;
        targets.forEach((t) => t.timeScale().setVisibleRange(range));
      });
    };
    sync(mainChart, [rsiChart, macdChart]);
    sync(rsiChart, [mainChart, macdChart]);
    sync(macdChart, [mainChart, rsiChart]);

    // --- Resize ---
    const ro = new ResizeObserver((entries) => {
      for (const e of entries) {
        const w = e.contentRect.width;
        mainChart.applyOptions({ width: w });
        rsiChart.applyOptions({ width: w });
        macdChart.applyOptions({ width: w });
      }
    });
    ro.observe(mainRef.current);

    setReady(true);

    return () => {
      ro.disconnect();
      mainChart.remove();
      rsiChart.remove();
      macdChart.remove();
      setReady(false);
    };
  }, [prepared, mainHeight, showSMA, showEMA]);

  if (!rows || rows.length === 0) {
    return (
      <div style={{ padding: 12, color: "rgba(255,255,255,0.75)" }}>
        No data
      </div>
    );
  }

  return (
    <div style={{ width: "100%" }}>
      <div style={{ display: "flex", justifyContent: "space-between", marginBottom: 8 }}>
        <div style={{ color: "rgba(255,255,255,0.9)", fontWeight: 700 }}>
          {symbol} · Candlestick · RSI · MACD
        </div>
        <div style={{ color: "rgba(255,255,255,0.55)", fontSize: 12 }}>
          {ready ? "Ready" : "Loading..."}
        </div>
      </div>

      <div
        ref={mainRef}
        style={{
          width: "100%",
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      />

      <div style={{ height: 10 }} />

      <div
        ref={rsiRef}
        style={{
          width: "100%",
          borderRadius: 14,
          overflow: "hidden",
          border: "1px solid rgba(255,255,255,0.08)",
        }}
      />

      <div style={{ height: 10 }} />

      <div
        ref={macdRef}
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