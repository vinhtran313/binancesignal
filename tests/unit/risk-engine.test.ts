/**
 * Tests for Risk Engine - Position sizing and validation
 */
import { describe, it, expect } from 'vitest';
import { calculatePositionSize, roundToTickSize, roundToStepSize } from '@/server/risk-engine';
import type { SymbolInfo, TradingConfig } from '@/shared/types';

const defaultSymbolInfo: SymbolInfo = {
  symbol: 'BTCUSDT',
  baseAsset: 'BTC',
  quoteAsset: 'USDT',
  pricePrecision: 2,
  quantityPrecision: 3,
  tickSize: 0.01,
  stepSize: 0.001,
  minQty: 0.001,
  maxQty: 1000,
  minNotional: 5,
  status: 'TRADING',
};

const defaultConfig: TradingConfig = {
  leverage: 1,
  riskPercent: 1,
  maxPositions: 10,
  takerFee: 0.001,
  makerFee: 0.001,
  slippage: 0.0005,
};

describe('Position Sizing', () => {
  it('calculates correct size based on risk budget', () => {
    const result = calculatePositionSize(
      500,      // equity
      500,      // available balance
      50000,    // entry price
      49000,    // stop loss (1000 away)
      'LONG',
      defaultSymbolInfo,
      defaultConfig,
      0
    );

    expect(result.valid).toBe(true);
    // risk budget = 500 * 0.01 = 5 USDT
    // stop distance = 1000
    // raw qty = 5 / 1000 = 0.005
    expect(result.riskBudget).toBeCloseTo(5, 2);
    expect(result.quantity).toBeLessThanOrEqual(0.005);
    expect(result.quantity).toBeGreaterThan(0);
  });

  it('rejects when equity is zero', () => {
    const result = calculatePositionSize(
      0, 0, 50000, 49000, 'LONG', defaultSymbolInfo, defaultConfig, 0
    );
    expect(result.valid).toBe(false);
    expect(result.rejectReason).toContain('zero');
  });

  it('rejects when LONG SL is above entry', () => {
    const result = calculatePositionSize(
      500, 500, 50000, 51000, 'LONG', defaultSymbolInfo, defaultConfig, 0
    );
    expect(result.valid).toBe(false);
    expect(result.rejectReason).toContain('below entry');
  });

  it('rejects when SHORT SL is below entry', () => {
    const result = calculatePositionSize(
      500, 500, 50000, 49000, 'SHORT', defaultSymbolInfo, defaultConfig, 0
    );
    expect(result.valid).toBe(false);
    expect(result.rejectReason).toContain('above entry');
  });

  it('rejects when max positions reached', () => {
    const result = calculatePositionSize(
      500, 500, 50000, 49000, 'LONG', defaultSymbolInfo, defaultConfig, 10
    );
    expect(result.valid).toBe(false);
    expect(result.rejectReason).toContain('Max positions');
  });

  it('rejects when quantity below minimum', () => {
    const bigSymbol: SymbolInfo = {
      ...defaultSymbolInfo,
      minQty: 1,
      minNotional: 50000,
    };
    const result = calculatePositionSize(
      500, 500, 50000, 49000, 'LONG', bigSymbol, defaultConfig, 0
    );
    expect(result.valid).toBe(false);
  });

  it('rejects when insufficient balance', () => {
    const result = calculatePositionSize(
      500, 5, 50000, 49000, 'LONG', defaultSymbolInfo, defaultConfig, 0
    );
    // With only $5 available, should reject due to insufficient balance
    expect(result.valid).toBe(false);
  });

  it('respects step size rounding', () => {
    const result = calculatePositionSize(
      500, 500, 50000, 49000, 'LONG', defaultSymbolInfo, defaultConfig, 0
    );
    if (result.valid) {
      const steps = result.quantity / defaultSymbolInfo.stepSize;
      expect(Math.abs(steps - Math.round(steps))).toBeLessThan(0.0001);
    }
  });

  it('actual risk does not exceed budget', () => {
    const result = calculatePositionSize(
      500, 500, 50000, 49000, 'LONG', defaultSymbolInfo, defaultConfig, 0
    );
    if (result.valid) {
      const stopDistance = Math.abs(50000 - 49000);
      const maxLoss = result.quantity * stopDistance + result.totalFeeEstimate;
      expect(maxLoss).toBeLessThanOrEqual(result.riskBudget * 1.02); // 2% tolerance
    }
  });

  it('handles small-cap symbols with small prices', () => {
    const smallSymbol: SymbolInfo = {
      symbol: 'DOGEUSDT',
      baseAsset: 'DOGE',
      quoteAsset: 'USDT',
      pricePrecision: 5,
      quantityPrecision: 0,
      tickSize: 0.00001,
      stepSize: 1,
      minQty: 1,
      maxQty: 10000000,
      minNotional: 5,
      status: 'TRADING',
    };

    const result = calculatePositionSize(
      500, 500, 0.15, 0.14, 'LONG', smallSymbol, defaultConfig, 0
    );

    if (result.valid) {
      expect(result.quantity).toBeGreaterThanOrEqual(1);
      expect(result.quantity % 1).toBe(0); // Should be whole number
    }
  });
});

describe('Price Rounding', () => {
  it('rounds to tick size correctly', () => {
    expect(roundToTickSize(50000.123, 0.01)).toBe(50000.12);
    expect(roundToTickSize(0.12345, 0.0001)).toBe(0.1235);
    expect(roundToTickSize(50000.005, 0.01)).toBe(50000.01);
  });

  it('rounds quantity to step size correctly', () => {
    expect(roundToStepSize(0.0057, 0.001)).toBe(0.005);
    expect(roundToStepSize(5.7, 1)).toBe(5);
    expect(roundToStepSize(0.12345, 0.01)).toBe(0.12);
  });
});
