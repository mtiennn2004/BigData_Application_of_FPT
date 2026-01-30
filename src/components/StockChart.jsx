import React from "react";
import TradingViewChart from "./TradingViewChart";

/**
 * StockChart (wrapper)
 * Props:
 *  - rows: array [{ date:"dd/mm/yyyy", open, high, low, close, volume, ... }]
 *  - symbol: string (default "FPT")
 */
export default function StockChart({ rows, symbol = "FPT" }) {
  return (
    <div style={{ width: "100%" }}>
      <TradingViewChart rows={rows || []} symbol={symbol} />
    </div>
  );
}
