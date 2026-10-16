export { calculateEMA, updateEMA } from './ema';
export { calculateRSI } from './rsi';
export { calculateMACD, getLatestMacd, type MacdResult } from './macd';

import { calculateEMA } from './ema';
import { calculateRSI } from './rsi';
import { calculateMACD } from './macd';
import type { IndicatorSeries, Candle } from '@/shared/types';

/**
 * Calculate all required indicators from candles
 */
export function calculateAllIndicators(candles: Candle[]): IndicatorSeries {
  const closes = candles.map(c => c.close);

  const ema34 = calculateEMA(closes, 34);
  const ema89 = calculateEMA(closes, 89);
  const ema200 = calculateEMA(closes, 200);
  const ema610 = calculateEMA(closes, 610);
  const rsi14 = calculateRSI(closes, 14);
  const macd = calculateMACD(closes, 12, 26, 9);

  return {
    ema34,
    ema89,
    ema200,
    ema610,
    rsi14,
    macdLine: macd.macdLine,
    macdSignal: macd.signalLine,
    macdHistogram: macd.histogram,
  };
}
