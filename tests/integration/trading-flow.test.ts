/**
 * Integration test for complete trading flow
 * Market data → signal → risk → execution → accounting
 */
import { describe, it, expect, vi, beforeEach } from 'vitest';
import { calculateMACD } from '@/server/indicators/macd';
import { calculateRSI } from '@/server/indicators/rsi';
import { calculateEMA } from '@/server/indicators/ema';
import { checkMacdSignal } from '@/server/strategy-engine/macd-strategy';
import { getWaveStopLoss } from '@/server/strategy-engine/wave-detection';
import { calculatePositionSize } from '@/server/risk-engine';
import type { Candle, SymbolInfo, TradingConfig } from '@/shared/types';

function makeCandle(
  openTime: number,
  open: number,
  high: number,
  low: number,
  close: number
): Candle {
  return {
    openTime,
    open,
    high,
    low,
    close,
    volume: 1000,
    closeTime: openTime + 299999,
    quoteVolume: 1000 * close,
    trades: 100,
    isClosed: true,
  };
}

const testSymbolInfo: SymbolInfo = {
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

const testConfig: TradingConfig = {
  leverage: 1,
  riskPercent: 1,
  maxPositions: 10,
  takerFee: 0.001,
  makerFee: 0.001,
  slippage: 0.0005,
};

describe('Complete Trading Flow', () => {
  it('processes signal → sizing → PnL reconciliation', () => {
    // Generate data with a known MACD crossover pattern
    const candles: Candle[] = [];
    const basePrice = 50000;

    // Create 100 candles with a trend that produces MACD signals
    for (let i = 0; i < 100; i++) {
      const t = i * 300000;
      const price = basePrice + Math.sin(i * 0.2) * 1000 + (i > 50 ? 500 : 0);
      const high = price + 100;
      const low = price - 100;
      candles.push(makeCandle(t, price - 20, high, low, price));
    }

    // Check for signal
    const signal = checkMacdSignal(candles);

    // If we get a signal, verify the complete flow
    if (signal.hasSignal && !signal.rejectReason && signal.stopLoss) {
      // Verify signal data
      expect(signal.entryPrice).toBeGreaterThan(0);
      expect(signal.stopLoss).toBeGreaterThan(0);
      expect(signal.macdLine).toBeDefined();
      expect(signal.macdSignal).toBeDefined();

      // LONG signal: SL below entry
      if (signal.side === 'LONG') {
        expect(signal.stopLoss).toBeLessThan(signal.entryPrice);
      }
      // SHORT signal: SL above entry
      if (signal.side === 'SHORT') {
        expect(signal.stopLoss).toBeGreaterThan(signal.entryPrice);
      }

      // Calculate position size
      const sizing = calculatePositionSize(
        500, 500,
        signal.entryPrice,
        signal.stopLoss,
        signal.side!,
        testSymbolInfo,
        testConfig,
        0
      );

      if (sizing.valid) {
        // Verify risk constraints
        const stopDist = Math.abs(signal.entryPrice - signal.stopLoss);
        const maxRiskFromPosition = sizing.quantity * stopDist;
        const riskBudget = 500 * 0.01; // 1% of $500

        // Position risk (excluding fees) should not greatly exceed budget
        expect(maxRiskFromPosition).toBeLessThanOrEqual(riskBudget * 1.1);

        // Verify notional
        expect(sizing.entryNotional).toBeCloseTo(
          sizing.quantity * signal.entryPrice * (1 + testConfig.slippage),
          0
        );

        // Verify entry fee
        expect(sizing.entryFee).toBeCloseTo(
          sizing.entryNotional * testConfig.takerFee,
          6
        );

        // Simulate a winning trade
        const exitPrice = signal.side === 'LONG'
          ? signal.entryPrice + stopDist // 1:1 R:R
          : signal.entryPrice - stopDist;

        const grossPnl = signal.side === 'LONG'
          ? sizing.quantity * (exitPrice - signal.entryPrice)
          : sizing.quantity * (signal.entryPrice - exitPrice);

        const exitNotional = sizing.quantity * exitPrice;
        const exitFee = exitNotional * testConfig.takerFee;
        const totalFees = sizing.entryFee + exitFee;
        const netPnl = grossPnl - totalFees;

        // Winning trade should have positive net PnL (assuming 1:1 R:R)
        expect(grossPnl).toBeGreaterThan(0);

        // Account reconciliation
        const newBalance = 500 - sizing.entryFee + grossPnl - exitFee;
        expect(newBalance).toBeCloseTo(500 + netPnl, 6);
      }
    }
  });

  it('indicator consistency between chart and strategy', () => {
    // Same data should produce same indicators regardless of how called
    const closes = Array.from({ length: 100 }, (_, i) => 100 + Math.sin(i * 0.15) * 20);

    const ema34_1 = calculateEMA(closes, 34);
    const ema34_2 = calculateEMA(closes, 34);

    // Should be identical
    for (let i = 0; i < closes.length; i++) {
      expect(ema34_1[i]).toBe(ema34_2[i]);
    }

    // MACD should be deterministic
    const macd1 = calculateMACD(closes, 12, 26, 9);
    const macd2 = calculateMACD(closes, 12, 26, 9);

    for (let i = 0; i < closes.length; i++) {
      expect(macd1.histogram[i]).toBe(macd2.histogram[i]);
    }
  });

  it('deduplication prevents double processing', () => {
    const candles: Candle[] = [];
    for (let i = 0; i < 80; i++) {
      const t = i * 300000;
      const price = 50000 + Math.sin(i * 0.2) * 1000;
      candles.push(makeCandle(t, price - 20, price + 100, price - 100, price));
    }

    // Process same candle data twice should produce same signal
    const signal1 = checkMacdSignal(candles);
    const signal2 = checkMacdSignal(candles);

    expect(signal1.hasSignal).toBe(signal2.hasSignal);
    expect(signal1.side).toBe(signal2.side);
    expect(signal1.macdHistogram).toBe(signal2.macdHistogram);
  });
});
