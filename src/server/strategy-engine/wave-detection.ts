/**
 * MACD Wave Detection
 * Detects positive and negative histogram waves for Stop Loss calculation
 *
 * Wave definition:
 * - A positive wave: consecutive sequence of positive histogram values
 * - A negative wave: consecutive sequence of negative histogram values
 * - Boundaries occur when histogram sign changes
 *
 * For LONG: SL = lowest price of the most recent completed negative wave
 * For SHORT: SL = highest price of the most recent completed positive wave
 */

import type { Candle, MacdWave, Side } from '@/shared/types';

/**
 * Detect all completed MACD histogram waves
 * Only uses data available up to (and including) the current index
 */
export function detectMacdWaves(
  histogram: (number | null)[],
  candles: Candle[],
  macdLine: (number | null)[] = []
): MacdWave[] {
  const waves: MacdWave[] = [];
  let currentWaveStart = -1;
  let currentWaveType: 'POSITIVE' | 'NEGATIVE' | null = null;

  for (let i = 0; i < histogram.length; i++) {
    const h = histogram[i];
    if (h === null) continue;

    const type: 'POSITIVE' | 'NEGATIVE' = h > 0 ? 'POSITIVE' : h < 0 ? 'NEGATIVE' : currentWaveType || 'POSITIVE';

    // Treat zero as continuation of previous wave type, or skip
    if (h === 0) {
      if (currentWaveType !== null) {
        continue; // Continue current wave
      }
      continue;
    }

    if (currentWaveType === null) {
      // Start first wave
      currentWaveStart = i;
      currentWaveType = type;
    } else if (type !== currentWaveType) {
      // Wave boundary - close the previous wave
      const wave = buildWave(currentWaveType, currentWaveStart, i - 1, candles, histogram, macdLine);
      if (wave) waves.push(wave);

      // Start new wave
      currentWaveStart = i;
      currentWaveType = type;
    }
  }

  // Note: we do NOT add the current (incomplete) wave
  // The last wave is only added when a sign change occurs

  return waves;
}

/**
 * Get Stop Loss price for a new position
 * No look-ahead: only uses data up to and including entryIndex
 */
export function getWaveStopLoss(
  side: Side,
  histogram: (number | null)[],
  candles: Candle[],
  entryIndex: number
): number | null {
  // Only use data up to entryIndex
  const histSlice = histogram.slice(0, entryIndex + 1);
  const candleSlice = candles.slice(0, entryIndex + 1);

  const waves = detectMacdWaves(histSlice, candleSlice);

  if (waves.length === 0) return null;

  if (side === 'LONG') {
    // Find the most recent completed negative wave
    for (let i = waves.length - 1; i >= 0; i--) {
      if (waves[i].type === 'NEGATIVE') {
        return waves[i].lowestPrice;
      }
    }
  } else {
    // Find the most recent completed positive wave
    for (let i = waves.length - 1; i >= 0; i--) {
      if (waves[i].type === 'POSITIVE') {
        return waves[i].highestPrice;
      }
    }
  }

  return null;
}

function buildWave(
  type: 'POSITIVE' | 'NEGATIVE',
  startIndex: number,
  endIndex: number,
  candles: Candle[],
  histogram: (number | null)[],
  macdLine: (number | null)[]
): MacdWave | null {
  if (startIndex < 0 || endIndex < startIndex || endIndex >= candles.length) {
    return null;
  }

  let highestPrice = -Infinity;
  let lowestPrice = Infinity;
  let highestPriceTime: number | null = null;
  let lowestPriceTime: number | null = null;
  let maxMacdLine: number | null = null;
  let maxMacdTime: number | null = null;
  let minMacdLine: number | null = null;
  let minMacdTime: number | null = null;
  let maxHistogram: number | null = null;
  let maxHistogramTime: number | null = null;
  let minHistogram: number | null = null;
  let minHistogramTime: number | null = null;

  for (let i = startIndex; i <= endIndex; i++) {
    if (candles[i]) {
      if (candles[i].high > highestPrice) { highestPrice = candles[i].high; highestPriceTime = candles[i].openTime; }
      if (candles[i].low < lowestPrice) { lowestPrice = candles[i].low; lowestPriceTime = candles[i].openTime; }
      const macd = macdLine[i];
      const hist = histogram[i];
      if (macd != null && (maxMacdLine == null || macd > maxMacdLine)) { maxMacdLine = macd; maxMacdTime = candles[i].openTime; }
      if (macd != null && (minMacdLine == null || macd < minMacdLine)) { minMacdLine = macd; minMacdTime = candles[i].openTime; }
      if (hist != null && (maxHistogram == null || hist > maxHistogram)) { maxHistogram = hist; maxHistogramTime = candles[i].openTime; }
      if (hist != null && (minHistogram == null || hist < minHistogram)) { minHistogram = hist; minHistogramTime = candles[i].openTime; }
    }
  }

  if (highestPrice === -Infinity || lowestPrice === Infinity) return null;

  return {
    type,
    startIndex,
    endIndex,
    highestPrice,
    lowestPrice,
    startTime: candles[startIndex].openTime,
    endTime: candles[endIndex].closeTime,
    maxMacdLine,
    maxMacdTime,
    minMacdLine,
    minMacdTime,
    maxHistogram,
    maxHistogramTime,
    minHistogram,
    minHistogramTime,
    highestPriceTime,
    lowestPriceTime,
  };
}
