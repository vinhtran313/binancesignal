/**
 * MACD Histogram Reversal Strategy Engine
 *
 * Entry Conditions:
 * Signals are provisional intrabar transitions; entries require later manual confirmation.
 * LONG: previous completed histogram <= 0, current unfinished histogram > 0.
 * SHORT: previous completed histogram >= 0, current unfinished histogram < 0.
 *
 * Stop Loss: based on MACD wave analysis
 * Exit: Stop Loss only (no take profit, no reverse-signal exit in v1)
 */

import type { Candle, Side, Timeframe, SignalEvent, SignalAction, SignalStrengthAssessment } from '@/shared/types';
import { calculateMACD } from '../indicators/macd';
import { getWaveStopLoss } from './wave-detection';
import { calculateSignalStrength } from './signal-strength';
import { logger } from '../utils/logger';
import { v4 as uuid } from 'uuid';

export interface SignalCheckResult {
  hasSignal: boolean;
  action: SignalAction | null;
  side: Side | null;
  entryPrice: number;
  stopLoss: number | null;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  prevHistogram: number;
  rejectReason: string | null;
  strength: SignalStrengthAssessment | null;
}

/**
 * Check for an intrabar MACD Histogram Reversal signal.
 */
export function checkMacdSignal(
  candles: Candle[],
  macdFast: number = 12,
  macdSlow: number = 26,
  macdSignalPeriod: number = 9,
  existingSymbolPosition: boolean = false,
  openPositionsCount: number = 0,
  maxPositions: number = 10
): SignalCheckResult {
  const noSignal: SignalCheckResult = {
    hasSignal: false,
    action: null,
    side: null,
    entryPrice: 0,
    stopLoss: null,
    macdLine: 0,
    macdSignal: 0,
    macdHistogram: 0,
    prevHistogram: 0,
    rejectReason: null,
    strength: null,
  };

  if (candles.length < macdSlow + macdSignalPeriod + 2) {
    return { ...noSignal, rejectReason: 'Insufficient candle history for MACD' };
  }

  const closes = candles.map(c => c.close);
  const macd = calculateMACD(closes, macdFast, macdSlow, macdSignalPeriod);

  const lastIdx = candles.length - 1;
  const prevIdx = lastIdx - 1;

  const currentHist = macd.histogram[lastIdx];
  const prevHist = macd.histogram[prevIdx];
  const currentMacd = macd.macdLine[lastIdx];
  const currentSignal = macd.signalLine[lastIdx];

  if (currentHist === null || prevHist === null || currentMacd === null || currentSignal === null) {
    return { ...noSignal, rejectReason: 'MACD values not available (warmup period)' };
  }

  const base = {
    entryPrice: candles[lastIdx].close,
    macdLine: currentMacd,
    macdSignal: currentSignal,
    macdHistogram: currentHist,
    prevHistogram: prevHist,
  };

  // The current candle must still be forming. Signals are generated intrabar.
  if (candles[lastIdx].isClosed) return { ...noSignal, ...base };

  // Check LONG conditions. MACD/Signal zero-line position is intentionally irrelevant.
  const isLongSignal =
    prevHist <= 0 &&
    currentHist > 0;

  // Check SHORT conditions
  const isShortSignal =
    prevHist >= 0 &&
    currentHist < 0;

  if (!isLongSignal && !isShortSignal) {
    return { ...noSignal, ...base };
  }

  const side: Side = isLongSignal ? 'LONG' : 'SHORT';
  const action: SignalAction = isLongSignal ? 'ENTRY_LONG' : 'ENTRY_SHORT';

  // Position and risk constraints are rechecked atomically before execution.
  void existingSymbolPosition;
  void openPositionsCount;
  void maxPositions;

  // Calculate Stop Loss from wave analysis
  const stopLoss = getWaveStopLoss(side, macd.histogram, candles, lastIdx);
  const strength = calculateSignalStrength(side, candles, macd, stopLoss);

  if (stopLoss === null) {
    return {
      ...noSignal,
      ...base,
      hasSignal: true,
      action,
      side,
      strength,
      rejectReason: 'Could not determine stop loss from wave analysis',
    };
  }

  // Validate SL direction
  if (side === 'LONG' && stopLoss >= candles[lastIdx].close) {
    return {
      ...noSignal,
      ...base,
      hasSignal: true,
      action,
      side,
      stopLoss,
      strength,
      rejectReason: 'LONG stop loss is above or at entry price',
    };
  }

  if (side === 'SHORT' && stopLoss <= candles[lastIdx].close) {
    return {
      ...noSignal,
      ...base,
      hasSignal: true,
      action,
      side,
      stopLoss,
      strength,
      rejectReason: 'SHORT stop loss is below or at entry price',
    };
  }

  return {
    hasSignal: true,
    action,
    side,
    stopLoss,
    strength,
    ...base,
    rejectReason: null,
  };
}

/**
 * Create idempotency key for signal deduplication
 */
export function createSignalIdempotencyKey(
  strategyRunId: string,
  symbol: string,
  timeframe: Timeframe,
  candleCloseTime: number
): string {
  void strategyRunId;
  return `signal:${symbol}:${timeframe}:${candleCloseTime}`;
}

/**
 * Build a SignalEvent from check result
 */
export function buildSignalEvent(
  result: SignalCheckResult,
  strategyRunId: string,
  symbol: string,
  timeframe: Timeframe,
  candleCloseTime: number,
  candleOpenTime: number = candleCloseTime,
  expiresAt: number = candleCloseTime
): Omit<SignalEvent, 'createdAt'> {
  return {
    id: uuid(),
    strategyRunId,
    symbol,
    timeframe,
    action: result.action || 'ENTRY_LONG',
    result: result.rejectReason ? 'REJECTED' : 'ACTIONABLE',
    rejectReason: result.rejectReason,
    entryPrice: result.entryPrice || null,
    stopLoss: result.stopLoss,
    candleCloseTime,
    candleOpenTime,
    expiresAt,
    confirmationTime: null,
    takeProfit: null,
    macdLine: result.macdLine,
    macdSignal: result.macdSignal,
    macdHistogram: result.macdHistogram,
    prevHistogram: result.prevHistogram,
    strengthScore: result.strength?.score ?? 0,
    strengthLabel: result.strength?.label ?? 'UNSCORED',
    strengthBreakdown: result.strength?.breakdown ?? {
      emaAlignment: 0, macdMomentum: 0, waveContext: 0, rsi: 0, volume: 0, stopQuality: 0,
      rsiValue: null, volumeRatio: null, atr: null, stopDistanceAtr: null,
      waveComparison: 'UNAVAILABLE', previousMacdExtreme: null, priorMacdExtreme: null,
      previousPriceExtreme: null, priorPriceExtreme: null,
    },
    scoreVersion: result.strength?.version ?? 'signal-strength-v1',
  };
}
