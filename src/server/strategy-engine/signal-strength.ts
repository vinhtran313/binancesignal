import type { SignalStrengthAssessment, SignalStrengthBreakdown, Side, Candle } from '@/shared/types';
import { calculateEMA } from '../indicators/ema';
import { calculateRSI } from '../indicators/rsi';
import type { MacdResult } from '../indicators/macd';
import { detectMacdWaves } from './wave-detection';

export const SIGNAL_STRENGTH_VERSION = 'signal-strength-v1';

/**
 * Explainable 100-point score for the first auto-paper-trading release.
 * Weights: EMA trend 25, MACD impulse 25, prior-wave context 20,
 * RSI 10, volume 10, and stop distance 10.
 */
export function calculateSignalStrength(
  side: Side,
  candles: Candle[],
  macd: MacdResult,
  stopLoss: number | null
): SignalStrengthAssessment {
  const lastIndex = candles.length - 1;
  const previousIndex = lastIndex - 1;
  const close = candles[lastIndex]?.close ?? 0;
  const currentHistogram = macd.histogram[lastIndex] ?? 0;
  const previousHistogram = macd.histogram[previousIndex] ?? 0;
  const currentMacd = macd.macdLine[lastIndex] ?? 0;

  const ema34 = calculateEMA(candles.map(candle => candle.close), 34);
  const ema89 = calculateEMA(candles.map(candle => candle.close), 89);
  const ema200 = calculateEMA(candles.map(candle => candle.close), 200);
  const ema610 = calculateEMA(candles.map(candle => candle.close), 610);
  const rsi14 = calculateRSI(candles.map(candle => candle.close), 14)[lastIndex] ?? null;
  const atr = calculateAtr(candles, 14);

  const emaAlignment = scoreEmaAlignment(side, close, lastIndex, ema34, ema89, ema200, ema610);
  const macdMomentum = scoreMacdMomentum(side, currentMacd, currentHistogram, previousHistogram, atr);
  const wave = scoreWaveContext(side, candles, macd);
  const rsi = scoreRsi(side, rsi14);
  const volume = scoreVolume(candles, lastIndex);
  const stopDistanceAtr = atr && stopLoss !== null ? Math.abs(close - stopLoss) / atr : null;
  const stopQuality = scoreStopDistance(stopDistanceAtr);
  const score = Math.max(0, Math.min(100, Math.round(emaAlignment + macdMomentum + wave.score + rsi + volume + stopQuality)));

  const breakdown: SignalStrengthBreakdown = {
    emaAlignment,
    macdMomentum,
    waveContext: wave.score,
    rsi,
    volume,
    stopQuality,
    rsiValue: rsi14,
    volumeRatio: volumeRatio(candles, lastIndex),
    atr,
    stopDistanceAtr,
    waveComparison: wave.comparison,
    previousMacdExtreme: wave.previousMacdExtreme,
    priorMacdExtreme: wave.priorMacdExtreme,
    previousPriceExtreme: wave.previousPriceExtreme,
    priorPriceExtreme: wave.priorPriceExtreme,
  };

  return {
    score,
    label: score >= 75 ? 'STRONG' : score >= 50 ? 'MODERATE' : 'WEAK',
    version: SIGNAL_STRENGTH_VERSION,
    breakdown,
  };
}

export function isEligibleForAutoEntry(score: number, threshold = 50): boolean {
  return Number.isFinite(score) && score >= threshold;
}

function scoreEmaAlignment(
  side: Side,
  close: number,
  index: number,
  ema34: (number | null)[],
  ema89: (number | null)[],
  ema200: (number | null)[],
  ema610: (number | null)[]
): number {
  const current = [ema34[index], ema89[index], ema200[index], ema610[index]];
  const relativeWeights = [6, 4, 3, 2];
  const aligns = (value: number | null | undefined) => value !== null && value !== undefined
    && (side === 'LONG' ? close > value : close < value);
  let score = current.reduce<number>((total, value, position) => total + (aligns(value) ? relativeWeights[position] : 0), 0);

  const trend34 = ema34[index];
  const trend89 = ema89[index];
  const trend200 = ema200[index];
  if (trend34 !== null && trend34 !== undefined && trend89 !== null && trend89 !== undefined) {
    if (side === 'LONG' ? trend34 > trend89 : trend34 < trend89) score += 5;
  }
  if (trend89 !== null && trend89 !== undefined && trend200 !== null && trend200 !== undefined) {
    if (side === 'LONG' ? trend89 > trend200 : trend89 < trend200) score += 3;
  }
  const priorIndex = Math.max(0, index - 3);
  if (trend34 !== null && trend34 !== undefined && ema34[priorIndex] !== null && ema34[priorIndex] !== undefined) {
    if (side === 'LONG' ? trend34 > ema34[priorIndex]! : trend34 < ema34[priorIndex]!) score += 2;
  }
  return Math.min(25, score);
}

function scoreMacdMomentum(side: Side, macdLine: number, current: number, previous: number, atr: number | null): number {
  // The directional histogram cross itself earns six points. The rest rewards
  // an expanding impulse normalized by volatility and MACD regime alignment.
  const crossPoints = 6;
  const impulseRatio = atr && atr > 0 ? Math.abs(current - previous) / atr : 0;
  const impulsePoints = Math.min(14, Math.round((impulseRatio / 0.12) * 14));
  const regimePoints = side === 'LONG' ? (macdLine > 0 ? 5 : 0) : (macdLine < 0 ? 5 : 0);
  return Math.min(25, crossPoints + impulsePoints + regimePoints);
}

function scoreWaveContext(side: Side, candles: Candle[], macd: MacdResult): {
  score: number;
  comparison: SignalStrengthBreakdown['waveComparison'];
  previousMacdExtreme: number | null;
  priorMacdExtreme: number | null;
  previousPriceExtreme: number | null;
  priorPriceExtreme: number | null;
} {
  const waveType = side === 'LONG' ? 'NEGATIVE' : 'POSITIVE';
  const waves = detectMacdWaves(macd.histogram, candles, macd.macdLine).filter(wave => wave.type === waveType);
  const latest = waves.at(-1);
  const prior = waves.at(-2);
  const macdExtreme = (wave: (typeof waves)[number]) => side === 'LONG' ? wave.minMacdLine : wave.maxMacdLine;
  const priceExtreme = (wave: (typeof waves)[number]) => side === 'LONG' ? wave.lowestPrice : wave.highestPrice;
  const latestMacd = latest ? macdExtreme(latest) : null;
  const priorMacd = prior ? macdExtreme(prior) : null;
  const latestPrice = latest ? priceExtreme(latest) : null;
  const priorPrice = prior ? priceExtreme(prior) : null;

  if (latestMacd === null || latestPrice === null) {
    return { score: 8, comparison: 'UNAVAILABLE', previousMacdExtreme: latestMacd, priorMacdExtreme: priorMacd, previousPriceExtreme: latestPrice, priorPriceExtreme: priorPrice };
  }
  if (priorMacd === null || priorPrice === null) {
    return { score: 12, comparison: 'UNAVAILABLE', previousMacdExtreme: latestMacd, priorMacdExtreme: null, previousPriceExtreme: latestPrice, priorPriceExtreme: null };
  }

  const improvingMomentum = side === 'LONG' ? latestMacd > priorMacd : latestMacd < priorMacd;
  const priceMakesExtreme = side === 'LONG' ? latestPrice < priorPrice : latestPrice > priorPrice;
  const comparison = improvingMomentum && priceMakesExtreme
    ? side === 'LONG' ? 'BULLISH_DIVERGENCE' : 'BEARISH_DIVERGENCE'
    : improvingMomentum ? 'MOMENTUM_IMPROVING' : 'NONE';
  const score = comparison === 'BULLISH_DIVERGENCE' || comparison === 'BEARISH_DIVERGENCE'
    ? 20
    : improvingMomentum ? 16
      : priceMakesExtreme ? 5 : 10;

  return { score, comparison, previousMacdExtreme: latestMacd, priorMacdExtreme: priorMacd, previousPriceExtreme: latestPrice, priorPriceExtreme: priorPrice };
}

function scoreRsi(side: Side, value: number | null): number {
  if (value === null) return 4;
  if (side === 'LONG') {
    if (value >= 40 && value <= 70) return 10;
    if ((value >= 35 && value < 40) || (value > 70 && value <= 75)) return 7;
    return value < 35 ? 5 : 2;
  }
  if (value >= 30 && value <= 60) return 10;
  if ((value >= 25 && value < 30) || (value > 60 && value <= 65)) return 7;
  return value > 65 ? 5 : 2;
}

function scoreVolume(candles: Candle[], index: number): number {
  const ratio = volumeRatio(candles, index);
  if (ratio === null) return 4;
  if (ratio >= 1.5) return 10;
  if (ratio >= 1.1) return 8;
  if (ratio >= 0.8) return 6;
  if (ratio >= 0.5) return 3;
  return 1;
}

function volumeRatio(candles: Candle[], index: number): number | null {
  const start = Math.max(0, index - 20);
  const previous = candles.slice(start, index).map(candle => candle.volume).filter(value => Number.isFinite(value) && value > 0);
  if (previous.length === 0) return null;
  const average = previous.reduce((total, value) => total + value, 0) / previous.length;
  return average > 0 ? candles[index].volume / average : null;
}

function scoreStopDistance(stopDistanceAtr: number | null): number {
  if (stopDistanceAtr === null || !Number.isFinite(stopDistanceAtr)) return 0;
  if (stopDistanceAtr >= 0.5 && stopDistanceAtr <= 2) return 10;
  if ((stopDistanceAtr >= 0.25 && stopDistanceAtr < 0.5) || (stopDistanceAtr > 2 && stopDistanceAtr <= 3)) return 7;
  if ((stopDistanceAtr >= 0.1 && stopDistanceAtr < 0.25) || (stopDistanceAtr > 3 && stopDistanceAtr <= 4)) return 3;
  return 1;
}

function calculateAtr(candles: Candle[], period: number): number | null {
  if (candles.length < 2) return null;
  const start = Math.max(1, candles.length - period);
  const ranges: number[] = [];
  for (let index = start; index < candles.length; index++) {
    const candle = candles[index];
    const previousClose = candles[index - 1].close;
    ranges.push(Math.max(candle.high - candle.low, Math.abs(candle.high - previousClose), Math.abs(candle.low - previousClose)));
  }
  if (ranges.length === 0) return null;
  return ranges.reduce((total, value) => total + value, 0) / ranges.length;
}
