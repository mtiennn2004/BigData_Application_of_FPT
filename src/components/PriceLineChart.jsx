// import React, { useMemo } from "react";
// import {
//   ResponsiveContainer,
//   LineChart,
//   Line,
//   XAxis,
//   YAxis,
//   Tooltip,
//   CartesianGrid,
//   BarChart,
//   Bar,
//   Area,
// } from "recharts";
// import { sma, ema, bollinger } from "../utils/indicators";

// function toChartData(rows) {
//   // rows từ API: mới -> cũ, đảo thành cũ -> mới để vẽ đúng timeline
//   const data = [...(rows || [])].reverse();

//   return data.map((r, idx) => ({
//     date: r.date,
//     close: Number(r.close),
//     volume: Number(r.volume || 0),

//     // giữ thêm để tooltip / nâng cấp sau (nếu muốn)
//     open: r.open != null ? Number(r.open) : null,
//     high: r.high != null ? Number(r.high) : null,
//     low: r.low != null ? Number(r.low) : null,

//     _idx: idx,
//   }));
// }

// function formatShortDate(s) {
//   // dd/mm/yyyy -> dd/mm
//   if (!s || typeof s !== "string") return s;
//   const parts = s.split("/");
//   if (parts.length !== 3) return s;
//   return `${parts[0]}/${parts[1]}`;
// }

// function humanNumber(n) {
//   if (n == null || Number.isNaN(n)) return "—";
//   return new Intl.NumberFormat("vi-VN").format(n);
// }

// function formatVolAxis(v) {
//   if (v == null) return "—";
//   if (v >= 1_000_000) return `${Math.round(v / 1_000_000)}M`;
//   if (v >= 1_000) return `${Math.round(v / 1_000)}K`;
//   return String(v);
// }

// // Tooltip custom cho chart giá
// function PriceTooltip({ active, payload, label }) {
//   if (!active || !payload?.length) return null;

//   // payload có thể chứa nhiều series, lấy close/volume từ item đầu tiên có value
//   const byKey = {};
//   for (const p of payload) byKey[p.dataKey] = p.value;

//   return (
//     <div
//       style={{
//         background: "rgba(15, 26, 44, 0.92)",
//         border: "1px solid rgba(160,190,255,.20)",
//         borderRadius: 12,
//         padding: 10,
//         minWidth: 180,
//       }}
//     >
//       <div style={{ fontWeight: 800, marginBottom: 6 }}>Ngày: {label}</div>
//       <div style={{ display: "grid", gap: 4, fontSize: 13 }}>
//         <div>Close: <b>{humanNumber(byKey.close)}</b></div>
//         <div>Volume: <b>{humanNumber(byKey.volume)}</b></div>
//         {/* nếu muốn hiện OHLC thì bỏ comment */}
//         {/* <div>Open: <b>{humanNumber(byKey.open)}</b></div>
//         <div>High: <b>{humanNumber(byKey.high)}</b></div>
//         <div>Low: <b>{humanNumber(byKey.low)}</b></div> */}
//       </div>
//     </div>
//   );
// }

// export default function PriceLineChart({ rows }) {
//   const base = useMemo(() => toChartData(rows), [rows]);

//   const data = useMemo(() => {
//     if (!base.length) return [];

//     const closes = base.map((d) => d.close);

//     const sma20 = sma(closes, 20);
//     const ema20 = ema(closes, 20);
//     const bb = bollinger(closes, 20, 2);

//     // gắn vào từng điểm
//     return base.map((d, i) => {
//       const prevClose = i > 0 ? base[i - 1].close : d.close;
//       const isUp = d.close >= prevClose;

//       return {
//         ...d,
//         sma20: sma20[i],
//         ema20: ema20[i],
//         bbUpper: bb.upper[i],
//         bbLower: bb.lower[i],

//         // màu volume theo tăng/giảm
//         volColor: isUp ? "#22C55E" : "#EF4444",
//       };
//     });
//   }, [base]);

//   if (!data.length) {
//     return <div className="muted">Chưa có dữ liệu để vẽ chart.</div>;
//   }

//   return (
//     <div className="chart-wrap">
//       {/* ===== PRICE + INDICATORS ===== */}
//       <div className="chart-block">
//         <div className="chart-title">Giá đóng cửa (Close) + SMA/EMA/Bollinger</div>
//         <div className="chart-box">
//           <ResponsiveContainer width="100%" height={320}>
//             <LineChart data={data} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
//               <CartesianGrid strokeDasharray="3 3" stroke="rgba(160,190,255,.18)" />
//               <XAxis
//                 dataKey="date"
//                 tickFormatter={formatShortDate}
//                 minTickGap={22}
//                 stroke="rgba(210,225,255,.65)"
//                 tick={{ fill: "rgba(210,225,255,.75)", fontSize: 12 }}
//               />
//               <YAxis
//                 domain={["auto", "auto"]}
//                 stroke="rgba(210,225,255,.65)"
//                 tick={{ fill: "rgba(210,225,255,.75)", fontSize: 12 }}
//               />

//               <Tooltip content={<PriceTooltip />} />

//               {/* Bollinger fill: upper/lower */}
//               <Area
//                 type="monotone"
//                 dataKey="bbUpper"
//                 stroke="rgba(168,85,247,.55)"
//                 fill="rgba(168,85,247,.10)"
//                 dot={false}
//                 strokeWidth={1}
//                 connectNulls
//               />
//               <Area
//                 type="monotone"
//                 dataKey="bbLower"
//                 stroke="rgba(168,85,247,.55)"
//                 fill="rgba(168,85,247,.10)"
//                 dot={false}
//                 strokeWidth={1}
//                 connectNulls
//               />

//               {/* SMA / EMA */}
//               <Line
//                 type="monotone"
//                 dataKey="sma20"
//                 dot={false}
//                 stroke="#F59E0B"
//                 strokeWidth={1.5}
//                 connectNulls
//               />
//               <Line
//                 type="monotone"
//                 dataKey="ema20"
//                 dot={false}
//                 stroke="#22C55E"
//                 strokeWidth={1.5}
//                 connectNulls
//               />

//               {/* Close */}
//               <Line
//                 type="monotone"
//                 dataKey="close"
//                 dot={false}
//                 stroke="#4DA3FF"
//                 strokeWidth={2}
//               />
//             </LineChart>
//           </ResponsiveContainer>
//         </div>
//       </div>

//       {/* ===== VOLUME (COLOR UP/DOWN) ===== */}
//       <div className="chart-block">
//         <div className="chart-title">Khối lượng (Volume)</div>
//         <div className="chart-box">
//           <ResponsiveContainer width="100%" height={220}>
//             <BarChart data={data} margin={{ top: 10, right: 24, left: 0, bottom: 0 }}>
//               <CartesianGrid strokeDasharray="3 3" stroke="rgba(160,190,255,.18)" />
//               <XAxis
//                 dataKey="date"
//                 tickFormatter={formatShortDate}
//                 minTickGap={22}
//                 stroke="rgba(210,225,255,.65)"
//                 tick={{ fill: "rgba(210,225,255,.75)", fontSize: 12 }}
//               />
//               <YAxis
//                 tickFormatter={formatVolAxis}
//                 stroke="rgba(210,225,255,.65)"
//                 tick={{ fill: "rgba(210,225,255,.75)", fontSize: 12 }}
//               />
//               <Tooltip
//                 formatter={(value) => [humanNumber(value), "Volume"]}
//                 labelFormatter={(label) => `Ngày: ${label}`}
//               />

//               <Bar
//                 dataKey="volume"
//                 isAnimationActive={false}
//                 // màu theo từng bar
//                 fill="#64748B"
//               >
//                 {data.map((entry, index) => (
//                   <cell key={`cell-${index}`} fill={entry.volColor} />
//                 ))}
//               </Bar>
//             </BarChart>
//           </ResponsiveContainer>
//         </div>
//       </div>
//     </div>
//   );
// }
