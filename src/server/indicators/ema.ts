/**
 * Exponential Moving Average calculation
 * Matches TradingView's EMA formula
 */

export function calculateEMA(closes: number[], period: number): (number | null)[] {
  const result: (number | null)[] = new Array(closes.length).fill(null);

  if (closes.length < period) return result;

  // SMA for initial value
  let sum = 0;
  for (let i = 0; i < period; i++) {
    sum += closes[i];
  }
  result[period - 1] = sum / period;

  // EMA calculation
  const multiplier = 2 / (period + 1);
  for (let i = period; i < closes.length; i++) {
    const prevEma = result[i - 1]!;
    result[i] = (closes[i] - prevEma) * multiplier + prevEma;
  }

  return result;
}

export function updateEMA(prevEma: number, newClose: number, period: number): number {
  const multiplier = 2 / (period + 1);
  return (newClose - prevEma) * multiplier + prevEma;
}
