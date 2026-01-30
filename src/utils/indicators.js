export function sma(values, period) {
  const out = Array(values.length).fill(null);
  let sum = 0;
  for (let i = 0; i < values.length; i++) {
    sum += values[i];
    if (i >= period) sum -= values[i - period];
    if (i >= period - 1) out[i] = sum / period;
  }
  return out;
}

export function ema(values, period) {
  const out = Array(values.length).fill(null);
  const k = 2 / (period + 1);
  let prev = values[0];
  out[0] = prev;

  for (let i = 1; i < values.length; i++) {
    prev = values[i] * k + prev * (1 - k);
    out[i] = prev;
  }

  for (let i = 0; i < period - 1; i++) out[i] = null;
  return out;
}

export function rsi(values, period = 14) {
  const out = Array(values.length).fill(null);
  if (values.length <= period) return out;

  let gain = 0, loss = 0;
  for (let i = 1; i <= period; i++) {
    const diff = values[i] - values[i - 1];
    if (diff >= 0) gain += diff;
    else loss -= diff;
  }
  gain /= period;
  loss /= period;

  out[period] = loss === 0 ? 100 : 100 - (100 / (1 + gain / loss));

  for (let i = period + 1; i < values.length; i++) {
    const diff = values[i] - values[i - 1];
    const g = diff > 0 ? diff : 0;
    const l = diff < 0 ? -diff : 0;

    gain = (gain * (period - 1) + g) / period;
    loss = (loss * (period - 1) + l) / period;

    out[i] = loss === 0 ? 100 : 100 - (100 / (1 + gain / loss));
  }
  return out;
}

export function macd(values, fast = 12, slow = 26, signal = 9) {
  const fastE = ema(values, fast);
  const slowE = ema(values, slow);

  const line = values.map((_, i) =>
    fastE[i] == null || slowE[i] == null ? null : fastE[i] - slowE[i]
  );

  // tạo mảng cho signal EMA, nhưng phải tránh null
  const safe = line.map(v => (v == null ? 0 : v));
  const signalLine = ema(safe, signal);

  // set null đồng bộ với line
  for (let i = 0; i < values.length; i++) {
    if (line[i] == null) signalLine[i] = null;
  }

  const hist = values.map((_, i) =>
    line[i] == null || signalLine[i] == null ? null : line[i] - signalLine[i]
  );

  return { line, signal: signalLine, hist };
}

export function bollinger(values, period = 20, mult = 2) {
  const mid = sma(values, period);
  const upper = Array(values.length).fill(null);
  const lower = Array(values.length).fill(null);

  for (let i = period - 1; i < values.length; i++) {
    const m = mid[i];
    const slice = values.slice(i - period + 1, i + 1);
    const variance = slice.reduce((acc, v) => acc + (v - m) * (v - m), 0) / period;
    const sd = Math.sqrt(variance);
    upper[i] = m + mult * sd;
    lower[i] = m - mult * sd;
  }
  return { mid, upper, lower };
}

export function pctChange(values) {
  const out = Array(values.length).fill(null);
  for (let i = 1; i < values.length; i++) {
    out[i] = ((values[i] - values[i - 1]) / values[i - 1]) * 100;
  }
  return out;
}

export function volatility(pctChanges, period = 20) {
  const out = Array(pctChanges.length).fill(null);
  for (let i = period; i < pctChanges.length; i++) {
    const slice = pctChanges.slice(i - period + 1, i + 1).filter(v => v != null);
    if (!slice.length) continue;
    const m = slice.reduce((a, b) => a + b, 0) / slice.length;
    const v = slice.reduce((a, b) => a + (b - m) * (b - m), 0) / slice.length;
    out[i] = Math.sqrt(v);
  }
  return out;
}

export function maxDrawdown(values) {
  let peak = -Infinity;
  let mdd = 0;
  for (const v of values) {
    peak = Math.max(peak, v);
    const dd = (v - peak) / peak;
    mdd = Math.min(mdd, dd);
  }
  return mdd * 100;
}
