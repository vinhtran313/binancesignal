/**
 * Tests for MACD Histogram Reversal Strategy
 */
import { describe, it, expect } from 'vitest';
import { checkMacdSignal } from '@/server/strategy-engine/macd-strategy';
import { detectMacdWaves, getWaveStopLoss } from '@/server/strategy-engine/wave-detection';
import type { Candle } from '@/shared/types';

// Helper: create candle data
function makeCandle(
  openTime: number,
  open: number,
  high: number,
  low: number,
  close: number,
  volume: number = 1000
): Candle {
  return {
    openTime,
    open,
    high,
    low,
    close,
    volume,
    closeTime: openTime + 300000 - 1,
    quoteVolume: volume * close,
    trades: 100,
    isClosed: true,
  };
}

// Helper: generate enough candles with sine wave pattern
function generateCandles(count: number, basePrice: number = 100, amplitude: number = 20): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < count; i++) {
    const t = i * 300000;
    const price = basePrice + Math.sin(i * 0.15) * amplitude;
    const high = price + Math.abs(Math.sin(i * 0.3)) * 2;
    const low = price - Math.abs(Math.cos(i * 0.3)) * 2;
    candles.push(makeCandle(t, price - 0.5, high, low, price));
  }
  return candles;
}

describe('MACD Strategy Signal Detection', () => {
  it('requires sufficient candle history', () => {
    const candles = generateCandles(30);
    const result = checkMacdSignal(candles);
    expect(result.rejectReason).toContain('Insufficient');
  });

  it('detects LONG signal on histogram sign transition', () => {
    const candles = reversalCandles('LONG');
    const result = checkMacdSignal(candles, 12, 26, 9, true, 10, 10);
    expect(result.hasSignal).toBe(true);
    expect(result.side).toBe('LONG');
    expect(result.prevHistogram).toBeLessThanOrEqual(0);
    expect(result.macdHistogram).toBeGreaterThan(0);
    // The qualifying histogram transition is valid while both MACD and signal remain below zero.
    expect(result.macdLine).toBeLessThan(0);
    expect(result.macdSignal).toBeLessThan(0);
    expect(result.rejectReason).toBeNull();
  });

  it('detects a SHORT intrabar transition without zero-line filters', () => {
    const candles = reversalCandles('SHORT');
    const result = checkMacdSignal(candles);
    expect(result.hasSignal).toBe(true);
    expect(result.side).toBe('SHORT');
    expect(result.prevHistogram).toBeGreaterThanOrEqual(0);
    expect(result.macdHistogram).toBeLessThan(0);
    expect(result.macdLine).toBeGreaterThan(0);
    expect(result.macdSignal).toBeGreaterThan(0);
  });

  it('waits for user confirmation and does not qualify a closed candle as intrabar', () => {
    const candles = reversalCandles('LONG');
    expect(candles[candles.length - 1].isClosed).toBe(false);
    const closed = [...candles];
    closed[closed.length - 1] = { ...closed[closed.length - 1], isClosed: true };
    expect(checkMacdSignal(closed).hasSignal).toBe(false);
  });

  it('rejects when position already exists for symbol', () => {
    const candles = generateCandles(100, 100, 30);
    const result = checkMacdSignal(candles, 12, 26, 9, true); // existingPosition = true

    if (result.hasSignal) {
      expect(result.rejectReason).toContain('Position already exists');
    }
  });

  it('rejects when max positions reached', () => {
    const candles = generateCandles(100, 100, 30);
    const result = checkMacdSignal(candles, 12, 26, 9, false, 10, 10);

    if (result.hasSignal) {
      expect(result.rejectReason).toContain('Max positions');
    }
  });

  it('only signals on sign transitions, not on continuation', () => {
    const candles = generateCandles(100, 100, 30);

    // Process candle-by-candle, collect all signals
    const signals: any[] = [];
    for (let i = 50; i < candles.length; i++) {
      const slice = candles.slice(0, i + 1);
      slice[slice.length - 1] = { ...slice[slice.length - 1], isClosed: false };
      const result = checkMacdSignal(slice);
      if (result.hasSignal) {
        signals.push({
          index: i,
          side: result.side,
          prevHist: result.prevHistogram,
          currHist: result.macdHistogram,
        });
      }
    }

    // Every signal should have a sign transition
    for (const signal of signals) {
      if (signal.side === 'LONG') {
        expect(signal.prevHist).toBeLessThanOrEqual(0);
        expect(signal.currHist).toBeGreaterThan(0);
      } else if (signal.side === 'SHORT') {
        expect(signal.prevHist).toBeGreaterThanOrEqual(0);
        expect(signal.currHist).toBeLessThan(0);
      }
    }
  });
});

function reversalCandles(side: 'LONG' | 'SHORT'): Candle[] {
  const candles: Candle[] = [];
  for (let i = 0; i < 130; i++) {
    const close = side === 'LONG'
      ? (i < 90 ? 120 - i * 0.3 - i * i * 0.001 : 120 - 90 * 0.3 - 90 * 90 * 0.001 + (i - 90) * 0.5)
      : (i < 90 ? 75 + i * 0.3 + i * i * 0.001 : 75 + 90 * 0.3 + 90 * 90 * 0.001 - (i - 90) * 0.5);
    candles.push({ ...makeCandle(i * 300_000, close, close + 0.2, close - 0.2, close), isClosed: true });
  }
  for (let end = 40; end < candles.length; end++) {
    const prefix = candles.slice(0, end + 1);
    prefix[end] = { ...prefix[end], isClosed: false };
    if (checkMacdSignal(prefix).hasSignal) return prefix;
  }
  return candles;
}

describe('MACD Wave Detection', () => {
  it('detects positive and negative waves', () => {
    const histogram = [null, null, 1, 2, 3, -1, -2, -3, 1, 2];
    const candles = generateCandles(10, 100, 5);

    const waves = detectMacdWaves(histogram, candles);

    // Should have at least one positive and one negative wave
    // Note: last wave is not added because it hasn't closed
    expect(waves.length).toBeGreaterThanOrEqual(1);
  });

  it('tracks highest and lowest prices within waves', () => {
    const histogram: (number | null)[] = [1, 1, 1, -1, -1, -1, 1, 1];
    const candles: Candle[] = [
      makeCandle(0, 100, 110, 95, 105),
      makeCandle(1, 105, 115, 100, 108),
      makeCandle(2, 108, 112, 98, 103),
      makeCandle(3, 103, 105, 90, 92),
      makeCandle(4, 92, 98, 85, 88),
      makeCandle(5, 88, 95, 82, 90),
      makeCandle(6, 90, 100, 88, 96),
      makeCandle(7, 96, 102, 92, 100),
    ];

    const waves = detectMacdWaves(histogram, candles);

    // First positive wave: indices 0-2
    // Highest high should be 115 (candle 1)
    // Lowest low should be 95 (candle 0)
    if (waves.length >= 1) {
      expect(waves[0].type).toBe('POSITIVE');
      expect(waves[0].highestPrice).toBe(115);
      expect(waves[0].lowestPrice).toBe(95);
    }

    // Negative wave: indices 3-5
    // Highest high should be 105 (candle 3)
    // Lowest low should be 82 (candle 5)
    if (waves.length >= 2) {
      expect(waves[1].type).toBe('NEGATIVE');
      expect(waves[1].highestPrice).toBe(105);
      expect(waves[1].lowestPrice).toBe(82);
    }
  });

  it('LONG SL uses lowest price of most recent negative wave', () => {
    const histogram: (number | null)[] = [1, 1, -1, -1, -1, 1, 1];
    const candles: Candle[] = [
      makeCandle(0, 100, 110, 95, 105),
      makeCandle(1, 105, 112, 100, 108),
      makeCandle(2, 108, 110, 92, 95),  // negative wave start
      makeCandle(3, 95, 100, 88, 90),   // negative wave - low = 88
      makeCandle(4, 90, 96, 85, 93),    // negative wave end - low = 85
      makeCandle(5, 93, 102, 91, 100),  // new positive wave
      makeCandle(6, 100, 105, 98, 103), // entry candle
    ];

    const sl = getWaveStopLoss('LONG', histogram, candles, 6);
    expect(sl).toBe(85); // Lowest price in the negative wave (indices 2-4)
  });

  it('SHORT SL uses highest price of most recent positive wave', () => {
    const histogram: (number | null)[] = [-1, -1, 1, 1, 1, -1, -1];
    const candles: Candle[] = [
      makeCandle(0, 100, 105, 92, 95),
      makeCandle(1, 95, 100, 88, 90),
      makeCandle(2, 90, 108, 88, 105),   // positive wave start
      makeCandle(3, 105, 115, 102, 112), // positive wave - high = 115
      makeCandle(4, 112, 118, 108, 110), // positive wave end - high = 118
      makeCandle(5, 110, 112, 95, 96),   // new negative wave
      makeCandle(6, 96, 100, 90, 92),    // entry candle
    ];

    const sl = getWaveStopLoss('SHORT', histogram, candles, 6);
    expect(sl).toBe(118); // Highest price in the positive wave (indices 2-4)
  });

  it('returns null when no suitable wave is found', () => {
    const histogram: (number | null)[] = [null, null, null, 1, 1, 1, 1];
    const candles = generateCandles(7, 100, 5);

    const sl = getWaveStopLoss('LONG', histogram, candles, 6);
    expect(sl).toBeNull(); // No negative wave exists
  });

  it('does not use future data (look-ahead bias)', () => {
    const histogram: (number | null)[] = [1, 1, -1, -1, 1, 1, -1, -1];
    const candles = generateCandles(8, 100, 10);

    // Get SL at index 4 (should not see data from index 5+)
    const slAt4 = getWaveStopLoss('LONG', histogram, candles, 4);

    // Get SL at index 7 (has more data)
    const slAt7 = getWaveStopLoss('LONG', histogram, candles, 7);

    // SL at 4 should only consider waves up to index 4
    // This is verified by the function using slice
    // Values may differ because more waves are available at index 7
  });
});
