import React from "react";
import TradingViewChart from "./TradingViewChart";
import ForecastCloseChart from "./ForecastCloseChart";

/**
 * StockChart (wrapper)
 * Props:
 *  - rows: array [{ date:"dd/mm/yyyy", open, high, low, close, volume, ... }]
 *  - forecast: array [{ date:"YYYY-MM-DD", predicted_close:number, step?:number }]
 *  - symbol: string
 */
export default function StockChart({ rows = [], forecast = [], symbol = "FPT" }) {
  return (
    <div style={{ width: "100%" }}>
      {/* Chart chính: Candlestick + RSI + MACD */}
      <TradingViewChart rows={rows} symbol={symbol} />

      <div style={{ height: 16 }} />

      {/* Chart mới: Close quá khứ + Forecast tương lai */}
      <ForecastCloseChart rows={rows} forecast={forecast} symbol={symbol} />
    </div>
  );
}
