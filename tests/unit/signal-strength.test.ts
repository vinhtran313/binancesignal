import { describe, expect, it } from 'vitest';
import type { Candle } from '@/shared/types';
import { calculateMACD } from '@/server/indicators/macd';
import { calculateSignalStrength, isEligibleForAutoEntry } from '@/server/strategy-engine/signal-strength';

function makeCandles(count: number): Candle[] {
  return Array.from({ length: count }, (_, index) => {
    const close = 100 + index * 0.025 + Math.sin(index * 0.22) * 2;
    const openTime = index * 300_000;
    return {
      openTime,
      closeTime: openTime + 299_999,
      open: close - 0.1,
      high: close + 0.8,
      low: close - 0.8,
      close,
      volume: 900 + (index % 7) * 50,
      quoteVolume: close * 1000,
      trades: 100,
      isClosed: index !== count - 1,
    };
  });
}

describe('signal strength v1', () => {
  it('allows automatic paper entry at 50 points and blocks below threshold', () => {
    expect(isEligibleForAutoEntry(49)).toBe(false);
    expect(isEligibleForAutoEntry(50)).toBe(true);
    expect(isEligibleForAutoEntry(100)).toBe(true);
    expect(isEligibleForAutoEntry(Number.NaN)).toBe(false);
  });

  it('returns a bounded, reproducible score with the configured component weights', () => {
    const candles = makeCandles(750);
    const macd = calculateMACD(candles.map(candle => candle.close));
    const result = calculateSignalStrength('LONG', candles, macd, candles.at(-1)!.close - 1.5);
    const components = result.breakdown;
    const sum = components.emaAlignment + components.macdMomentum + components.waveContext
      + components.rsi + components.volume + components.stopQuality;

    expect(result.score).toBeGreaterThanOrEqual(0);
    expect(result.score).toBeLessThanOrEqual(100);
    expect(result.score).toBe(sum);
    expect(result.version).toBe('signal-strength-v1');
    expect(result.breakdown.emaAlignment).toBeLessThanOrEqual(25);
    expect(result.breakdown.macdMomentum).toBeLessThanOrEqual(25);
    expect(result.breakdown.waveContext).toBeLessThanOrEqual(20);
    expect(result.breakdown.rsi).toBeLessThanOrEqual(10);
    expect(result.breakdown.volume).toBeLessThanOrEqual(10);
    expect(result.breakdown.stopQuality).toBeLessThanOrEqual(10);
  });
});
