/**
 * MACD (Moving Average Convergence Divergence)
 * Default: Fast 12, Slow 26, Signal 9
 */

import { calculateEMA } from './ema';

export interface MacdResult {
  macdLine: (number | null)[];
  signalLine: (number | null)[];
  histogram: (number | null)[];
}

export function calculateMACD(
  closes: number[],
  fastPeriod: number = 12,
  slowPeriod: number = 26,
  signalPeriod: number = 9
): MacdResult {
  const len = closes.length;
  const macdLine: (number | null)[] = new Array(len).fill(null);
  const signalLine: (number | null)[] = new Array(len).fill(null);
  const histogram: (number | null)[] = new Array(len).fill(null);

  if (len < slowPeriod) {
    return { macdLine, signalLine, histogram };
  }

  const fastEma = calculateEMA(closes, fastPeriod);
  const slowEma = calculateEMA(closes, slowPeriod);

  // MACD line = fast EMA - slow EMA
  const macdValues: number[] = [];
  for (let i = 0; i < len; i++) {
    if (fastEma[i] !== null && slowEma[i] !== null) {
      macdLine[i] = fastEma[i]! - slowEma[i]!;
      macdValues.push(macdLine[i]!);
    }
  }

  // Signal line = EMA of MACD line
  if (macdValues.length >= signalPeriod) {
    const signalEma = calculateEMA(macdValues, signalPeriod);

    let macdIdx = 0;
    for (let i = 0; i < len; i++) {
      if (macdLine[i] !== null) {
        if (signalEma[macdIdx] !== null) {
          signalLine[i] = signalEma[macdIdx]!;
          histogram[i] = macdLine[i]! - signalLine[i]!;
        }
        macdIdx++;
      }
    }
  }

  return { macdLine, signalLine, histogram };
}

export function getLatestMacd(
  macdLine: (number | null)[],
  signalLine: (number | null)[],
  histogram: (number | null)[]
): { macdLine: number | null; signalLine: number | null; histogram: number | null } {
  for (let i = macdLine.length - 1; i >= 0; i--) {
    if (macdLine[i] !== null && signalLine[i] !== null && histogram[i] !== null) {
      return {
        macdLine: macdLine[i],
        signalLine: signalLine[i],
        histogram: histogram[i],
      };
    }
  }
  return { macdLine: null, signalLine: null, histogram: null };
}
