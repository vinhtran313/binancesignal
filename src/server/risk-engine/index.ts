/**
 * Risk Engine - Position sizing and validation
 * Implements risk-based position sizing for linear USDT perpetuals
 */

import type { SymbolInfo, Side, TradingConfig } from '@/shared/types';
import { MAX_OPEN_POSITIONS } from '@/shared/types';

export interface PositionSizeResult {
  valid: boolean;
  quantity: number;
  entryNotional: number;
  margin: number;
  entryFee: number;
  exitFeeEstimate: number;
  totalFeeEstimate: number;
  riskBudget: number;
  stopDistance: number;
  rejectReason: string | null;
}

export function validateEntryConstraints(
  openPositions: ReadonlyArray<{ symbol: string }>,
  symbol: string,
  configuredMaxPositions: number
): string | null {
  if (openPositions.some(position => position.symbol === symbol)) return `Position already open for ${symbol}`;
  const maxPositions = Math.min(configuredMaxPositions, MAX_OPEN_POSITIONS);
  if (openPositions.length >= maxPositions) return `Max positions (${maxPositions}) reached`;
  return null;
}

/**
 * Calculate position size based on risk percentage
 *
 * risk_budget = equity * risk_percent / 100
 * stop_distance = abs(entry_price - stop_price)
 * raw_quantity = risk_budget / stop_distance
 * Then apply filters and constraints
 */
export function calculatePositionSize(
  equity: number,
  availableBalance: number,
  entryPrice: number,
  stopLoss: number,
  side: Side,
  symbolInfo: SymbolInfo,
  config: TradingConfig,
  openPositionsCount: number
): PositionSizeResult {
  const reject = (reason: string): PositionSizeResult => ({
    valid: false,
    quantity: 0,
    entryNotional: 0,
    margin: 0,
    entryFee: 0,
    exitFeeEstimate: 0,
    totalFeeEstimate: 0,
    riskBudget: 0,
    stopDistance: 0,
    rejectReason: reason,
  });

  // Validate inputs
  if (equity <= 0) return reject('Equity is zero or negative');
  if (entryPrice <= 0) return reject('Invalid entry price');
  if (stopLoss <= 0) return reject('Invalid stop loss price');

  // Check max positions
  const maxPositions = Math.min(config.maxPositions, MAX_OPEN_POSITIONS);
  if (openPositionsCount >= maxPositions) {
    return reject(`Max positions (${maxPositions}) reached`);
  }

  if (config.leverage <= 0) return reject('Leverage must be greater than zero');

  // Size against the executable entry, including slippage exactly once.
  const slippageMultiplier = side === 'LONG' ? (1 + config.slippage) : (1 - config.slippage);
  const adjustedEntryPrice = entryPrice * slippageMultiplier;
  if (side === 'LONG' && stopLoss >= adjustedEntryPrice) {
    return reject('LONG stop loss must be below entry price after slippage');
  }
  if (side === 'SHORT' && stopLoss <= adjustedEntryPrice) {
    return reject('SHORT stop loss must be above entry price after slippage');
  }

  const riskBudget = equity * (config.riskPercent / 100);
  const stopDistance = Math.abs(adjustedEntryPrice - stopLoss);
  if (stopDistance === 0) return reject('Zero stop distance');

  const estimatedFeesPerUnit = (adjustedEntryPrice + stopLoss) * config.takerFee;
  const riskPerUnit = stopDistance + estimatedFeesPerUnit;
  const balanceRequiredPerUnit = adjustedEntryPrice / config.leverage + estimatedFeesPerUnit;
  if (riskPerUnit <= 0 || balanceRequiredPerUnit <= 0) return reject('Unable to calculate a valid order size');

  // Respect both the configured risk budget and the margin/fee budget. When
  // balance is the tighter limit, reduce quantity instead of rejecting an
  // otherwise valid paper signal.
  const riskLimitedQuantity = riskBudget / riskPerUnit;
  const balanceLimitedQuantity = availableBalance / balanceRequiredPerUnit;
  const rawQuantity = Math.min(riskLimitedQuantity, balanceLimitedQuantity);

  // Apply step size rounding (floor to avoid exceeding risk)
  const stepSize = symbolInfo.stepSize;
  const precision = Math.max(0, -Math.floor(Math.log10(stepSize)));
  let quantity = Math.floor(rawQuantity / stepSize) * stepSize;
  quantity = parseFloat(quantity.toFixed(precision));

  const minimumOrderQuantity = Math.ceil(
    Math.max(symbolInfo.minQty, symbolInfo.minNotional / adjustedEntryPrice) / stepSize
  ) * stepSize;

  // Check minimum quantity
  if (quantity < symbolInfo.minQty) {
    if (balanceLimitedQuantity < minimumOrderQuantity && riskLimitedQuantity >= minimumOrderQuantity) {
      const minimumRequired = minimumOrderQuantity * balanceRequiredPerUnit;
      return reject(`Insufficient balance: minimum order requires ${minimumRequired.toFixed(2)}, have ${Math.max(0, availableBalance).toFixed(2)}`);
    }
    return reject(`Quantity ${quantity} below minimum ${symbolInfo.minQty}`);
  }

  // Check maximum quantity
  if (quantity > symbolInfo.maxQty) {
    quantity = roundToStepSize(symbolInfo.maxQty, stepSize);
  }

  // Calculate notional
  const entryNotional = quantity * adjustedEntryPrice;

  // Check minimum notional
  if (entryNotional < symbolInfo.minNotional) {
    if (balanceLimitedQuantity < minimumOrderQuantity && riskLimitedQuantity >= minimumOrderQuantity) {
      const minimumRequired = minimumOrderQuantity * balanceRequiredPerUnit;
      return reject(`Insufficient balance: minimum order requires ${minimumRequired.toFixed(2)}, have ${Math.max(0, availableBalance).toFixed(2)}`);
    }
    return reject(`Notional ${entryNotional.toFixed(2)} below minimum ${symbolInfo.minNotional}`);
  }

  // Calculate fees
  const entryFee = entryNotional * config.takerFee;
  const exitNotionalEstimate = quantity * stopLoss; // Conservative: fee at SL price
  const exitFeeEstimate = exitNotionalEstimate * config.takerFee;
  const totalFeeEstimate = entryFee + exitFeeEstimate;

  // Calculate margin
  const margin = entryNotional / config.leverage;

  // Guard against floating-point rounding at the balance boundary.
  const totalRequired = margin + totalFeeEstimate;
  if (totalRequired - availableBalance > Math.max(1e-8, Math.abs(availableBalance) * 1e-12)) {
    return reject(`Insufficient balance: need ${totalRequired.toFixed(2)}, have ${availableBalance.toFixed(2)}`);
  }

  // The risk-limited quantity includes estimated entry and stop-loss fees.
  const actualRisk = quantity * stopDistance + totalFeeEstimate;
  if (actualRisk > riskBudget * 1.01) {
    return reject('Cannot size position within risk budget after fees');
  }

  const finalEntryNotional = quantity * adjustedEntryPrice;
  const finalEntryFee = finalEntryNotional * config.takerFee;
  const finalExitFeeEstimate = (quantity * stopLoss) * config.takerFee;
  const finalMargin = finalEntryNotional / config.leverage;

  return {
    valid: true,
    quantity,
    entryNotional: finalEntryNotional,
    margin: finalMargin,
    entryFee: finalEntryFee,
    exitFeeEstimate: finalExitFeeEstimate,
    totalFeeEstimate: finalEntryFee + finalExitFeeEstimate,
    riskBudget,
    stopDistance,
    rejectReason: null,
  };
}

/**
 * Round price to tick size
 */
export function roundToTickSize(price: number, tickSize: number): number {
  const precision = Math.max(0, -Math.floor(Math.log10(tickSize)));
  return parseFloat((Math.round(price / tickSize) * tickSize).toFixed(precision));
}

/**
 * Round quantity to step size
 */
export function roundToStepSize(quantity: number, stepSize: number): number {
  const precision = Math.max(0, -Math.floor(Math.log10(stepSize)));
  return parseFloat((Math.floor(quantity / stepSize) * stepSize).toFixed(precision));
}
