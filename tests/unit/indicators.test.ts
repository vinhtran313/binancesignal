/**
 * Tests for indicator calculations: EMA, RSI, MACD
 */
import { describe, it, expect } from 'vitest';
import { calculateEMA, updateEMA } from '@/server/indicators/ema';
import { calculateRSI } from '@/server/indicators/rsi';
import { calculateMACD } from '@/server/indicators/macd';

describe('EMA', () => {
  it('returns nulls when insufficient data', () => {
    const result = calculateEMA([1, 2, 3], 5);
    expect(result.every(v => v === null)).toBe(true);
  });

  it('calculates SMA for first value', () => {
    const closes = [1, 2, 3, 4, 5];
    const result = calculateEMA(closes, 3);
    // SMA of [1,2,3] = 2
    expect(result[2]).toBeCloseTo(2, 6);
    expect(result[0]).toBeNull();
    expect(result[1]).toBeNull();
  });

  it('calculates correct EMA values', () => {
    const closes = [22.27, 22.19, 22.08, 22.17, 22.18, 22.13, 22.23, 22.43, 22.24, 22.29, 22.15, 22.39];
    const period = 10;
    const result = calculateEMA(closes, period);

    // First value should be SMA of first 10
    const sma = closes.slice(0, 10).reduce((a, b) => a + b, 0) / 10;
    expect(result[9]).toBeCloseTo(sma, 4);

    // Subsequent values should follow EMA formula
    expect(result[10]).not.toBeNull();
    expect(result[11]).not.toBeNull();
  });

  it('updateEMA matches calculated EMA', () => {
    const closes = [1, 2, 3, 4, 5, 6, 7, 8, 9, 10, 11];
    const period = 5;
    const ema = calculateEMA(closes.slice(0, -1), period);
    const lastEma = ema[ema.length - 1]!;
    const updated = updateEMA(lastEma, 11, period);
    const fullEma = calculateEMA(closes, period);
    expect(updated).toBeCloseTo(fullEma[fullEma.length - 1]!, 10);
  });
});

describe('RSI', () => {
  it('returns nulls when insufficient data', () => {
    const result = calculateRSI([1, 2, 3], 14);
    expect(result.every(v => v === null)).toBe(true);
  });

  it('returns 100 when all gains and no losses', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 + i);
    const result = calculateRSI(closes, 14);
    expect(result[14]).toBe(100);
  });

  it('returns 0 when all losses and no gains', () => {
    const closes = Array.from({ length: 20 }, (_, i) => 100 - i);
    const result = calculateRSI(closes, 14);
    expect(result[14]).toBe(0);
  });

  it('RSI stays between 0 and 100', () => {
    const closes = [44, 44.34, 44.09, 43.61, 44.33, 44.83, 45.10, 45.42, 45.84,
                    46.08, 45.89, 46.03, 45.61, 46.28, 46.28, 46.00, 46.03, 46.41,
                    46.22, 45.64];
    const result = calculateRSI(closes, 14);
    for (const v of result) {
      if (v !== null) {
        expect(v).toBeGreaterThanOrEqual(0);
        expect(v).toBeLessThanOrEqual(100);
      }
    }
  });
});

describe('MACD', () => {
  it('returns nulls when insufficient data', () => {
    const result = calculateMACD([1, 2, 3], 12, 26, 9);
    expect(result.macdLine.every(v => v === null)).toBe(true);
    expect(result.signalLine.every(v => v === null)).toBe(true);
    expect(result.histogram.every(v => v === null)).toBe(true);
  });

  it('calculates MACD line as difference of fast and slow EMA', () => {
    // Generate enough data
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.1) * 10);
    const result = calculateMACD(closes, 12, 26, 9);

    const fastEma = calculateEMA(closes, 12);
    const slowEma = calculateEMA(closes, 26);

    // MACD line should be fast - slow where both exist
    for (let i = 0; i < closes.length; i++) {
      if (result.macdLine[i] !== null && fastEma[i] !== null && slowEma[i] !== null) {
        expect(result.macdLine[i]).toBeCloseTo(fastEma[i]! - slowEma[i]!, 10);
      }
    }
  });

  it('histogram is MACD minus signal', () => {
    const closes = Array.from({ length: 50 }, (_, i) => 100 + Math.sin(i * 0.2) * 5);
    const result = calculateMACD(closes, 12, 26, 9);

    for (let i = 0; i < closes.length; i++) {
      if (result.histogram[i] !== null) {
        expect(result.histogram[i]).toBeCloseTo(
          result.macdLine[i]! - result.signalLine[i]!,
          10
        );
      }
    }
  });

  it('detects sign transitions in histogram', () => {
    // Create data that should produce histogram sign changes
    const closes = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i * 0.3) * 20);
    const result = calculateMACD(closes, 12, 26, 9);

    let hasPositive = false;
    let hasNegative = false;
    let hasTransition = false;

    for (let i = 1; i < result.histogram.length; i++) {
      const prev = result.histogram[i - 1];
      const curr = result.histogram[i];
      if (prev !== null && curr !== null) {
        if (curr > 0) hasPositive = true;
        if (curr < 0) hasNegative = true;
        if (prev <= 0 && curr > 0) hasTransition = true;
        if (prev >= 0 && curr < 0) hasTransition = true;
      }
    }

    expect(hasPositive).toBe(true);
    expect(hasNegative).toBe(true);
    expect(hasTransition).toBe(true);
  });
});
