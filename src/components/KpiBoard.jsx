import React, { useMemo } from "react";
import { sma, ema, rsi, macd, bollinger, pctChange, volatility, maxDrawdown } from "../utils/indicators";

export default function KpiBoard({ rows }) {
  const kpi = useMemo(() => {
    if (!rows?.length) return null;

    // rows bạn đang hiển thị là mới->cũ, nhưng tính indicator nên theo thời gian tăng dần
    const asc = [...rows].slice().reverse();
    const close = asc.map(r => Number(r.close)).filter(v => Number.isFinite(v));
    const volume = asc.map(r => Number(r.volume)).filter(v => Number.isFinite(v));

    if (close.length < 30) return null;

    const last = close[close.length - 1];
    const prev = close[close.length - 2];
    const dayChg = ((last - prev) / prev) * 100;

    const rsi14 = rsi(close, 14);
    const mac = macd(close);
    const bb = bollinger(close, 20, 2);
    const ret = pctChange(close);
    const vol20 = volatility(ret, 20);

    const sma20 = sma(close, 20);
    const ema20 = ema(close, 20);

    const lastRsi = rsi14[rsi14.length - 1];
    const lastMacd = mac.line[mac.line.length - 1];
    const lastSignal = mac.signal[mac.signal.length - 1];
    const lastHist = mac.hist[mac.hist.length - 1];
    const lastVol = vol20[vol20.length - 1];

    const high52w = Math.max(...close.slice(-252));
    const low52w  = Math.min(...close.slice(-252));
    const avgVol20 = volume.slice(-20).reduce((a,b)=>a+b,0)/Math.max(1, Math.min(20, volume.length));

    return {
      last, dayChg,
      sma20: sma20[sma20.length-1],
      ema20: ema20[ema20.length-1],
      rsi14: lastRsi,
      macd: lastMacd,
      signal: lastSignal,
      hist: lastHist,
      bbUpper: bb.upper[bb.upper.length-1],
      bbMid: bb.mid[bb.mid.length-1],
      bbLower: bb.lower[bb.lower.length-1],
      vol20: lastVol,
      high52w, low52w,
      mdd: maxDrawdown(close),
      avgVol20
    };
  }, [rows]);

  if (!kpi) return <div className="card" style={{padding:12}}>Chưa đủ dữ liệu để tính chỉ số.</div>;

  const fmt = (x, d=2) => (x==null || !Number.isFinite(x)) ? "-" : x.toFixed(d);
  const fmtInt = (x) => (x==null || !Number.isFinite(x)) ? "-" : Math.round(x).toLocaleString();

  const up = kpi.dayChg >= 0;

  return (
    <div className="card" style={{padding:12}}>
      <div style={{display:"flex", justifyContent:"space-between", alignItems:"baseline", gap:12}}>
        <div style={{fontSize:16, fontWeight:700}}>Chỉ số nhanh</div>
        <div className="muted">Dựa trên OHLCV từ file Excel</div>
      </div>

      <div style={{display:"grid", gridTemplateColumns:"repeat(4, minmax(0, 1fr))", gap:10, marginTop:12}}>
        <K label="Close" value={fmt(kpi.last)} tone={up ? "up" : "down"} suffix={up ? ` (+${fmt(kpi.dayChg)}%)` : ` (${fmt(kpi.dayChg)}%)`} />
        <K label="RSI(14)" value={fmt(kpi.rsi14)} />
        <K label="MACD / Signal" value={`${fmt(kpi.macd)} / ${fmt(kpi.signal)}`} />
        <K label="MACD Hist" value={fmt(kpi.hist)} tone={kpi.hist>=0 ? "up" : "down"} />
        <K label="SMA(20)" value={fmt(kpi.sma20)} />
        <K label="EMA(20)" value={fmt(kpi.ema20)} />
        <K label="Bollinger" value={`${fmt(kpi.bbLower)} · ${fmt(kpi.bbMid)} · ${fmt(kpi.bbUpper)}`} />
        <K label="Volatility(20)" value={fmt(kpi.vol20)} suffix=" (σ% daily)" />
        <K label="52W High" value={fmt(kpi.high52w)} />
        <K label="52W Low" value={fmt(kpi.low52w)} />
        <K label="Avg Vol(20)" value={fmtInt(kpi.avgVol20)} />
        <K label="Max Drawdown" value={fmt(kpi.mdd)} suffix="%" tone="down" />
      </div>
    </div>
  );
}

function K({ label, value, suffix="", tone }) {
  const color = tone === "up" ? "var(--up)" : tone === "down" ? "var(--down)" : "var(--text)";
  return (
    <div style={{background:"rgba(160,190,255,.06)", border:"1px solid rgba(160,190,255,.14)", borderRadius:12, padding:10}}>
      <div className="muted" style={{fontSize:12}}>{label}</div>
      <div style={{fontSize:16, fontWeight:800, color, marginTop:4}}>
        {value}<span className="muted" style={{fontWeight:600}}>{suffix}</span>
      </div>
    </div>
  );
}
