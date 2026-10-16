/**
 * Execution Engine - Paper trading execution
 * Handles simulated market order fills, stop loss triggers, and position management
 */

import { prisma } from '../persistence/prisma';
import { calculatePositionSize, roundToTickSize } from '../risk-engine';
import type { Side, SymbolInfo, TradingConfig, Position, ExitReason } from '@/shared/types';
import { logger } from '../utils/logger';
import { v4 as uuid } from 'uuid';

export interface FillResult {
  success: boolean;
  positionId: string | null;
  position: Position | null;
  rejectReason: string | null;
}

/**
 * Execute a simulated market entry
 */
export async function executeEntry(
  accountId: string,
  symbol: string,
  side: Side,
  entryPrice: number,
  stopLoss: number,
  symbolInfo: SymbolInfo,
  config: TradingConfig,
  strategyRunId?: string,
  signalId?: string,
  idempotencyKey?: string,
  riskRewardRatio: number = 2,
  analyticsSnapshot: { signal?: unknown; previousWave?: unknown; timeframe?: string } = {}
): Promise<FillResult> {
  try {
    // Check idempotency
    if (idempotencyKey) {
      const existing = await prisma.position.findUnique({
        where: { idempotencyKey },
      });
      if (existing) {
        logger.warn(`[Exec] Duplicate entry prevented: ${idempotencyKey}`);
        return {
          success: true,
          positionId: existing.id,
          position: mapDbPosition(existing),
          rejectReason: null,
        };
      }
    }

    // Get account state
    const account = await prisma.account.findUnique({
      where: { id: accountId },
      include: {
        positions: { where: { status: 'OPEN' } },
      },
    });

    if (!account) {
      return { success: false, positionId: null, position: null, rejectReason: 'Account not found' };
    }

    // Calculate unrealized PnL for equity
    const openPositionsCount = account.positions.length;

    // Calculate equity (balance + unrealized PnL)
    // For entry purposes, we use balance as conservative equity
    const equity = account.balance;
    const usedMargin = account.positions.reduce((sum, p) => sum + p.margin, 0);
    const availableBalance = equity - usedMargin;

    // Apply slippage to entry price
    const slippedEntryPrice = side === 'LONG'
      ? entryPrice * (1 + config.slippage)
      : entryPrice * (1 - config.slippage);

    // Round to tick size
    const finalEntryPrice = roundToTickSize(slippedEntryPrice, symbolInfo.tickSize);
    const finalStopLoss = roundToTickSize(stopLoss, symbolInfo.tickSize);

    // Calculate position size
    const sizing = calculatePositionSize(
      equity,
      availableBalance,
      entryPrice,
      finalStopLoss,
      side,
      symbolInfo,
      config,
      openPositionsCount
    );

    if (!sizing.valid) {
      return {
        success: false,
        positionId: null,
        position: null,
        rejectReason: sizing.rejectReason,
      };
    }

    const positionId = uuid();
    const now = new Date();
    const entryNotional = sizing.quantity * finalEntryPrice;
    const entryFee = entryNotional * config.takerFee;
    const margin = entryNotional / config.leverage;
    const riskDistance = side === 'LONG'
      ? finalEntryPrice - finalStopLoss
      : finalStopLoss - finalEntryPrice;
    if (!(riskDistance > 0)) {
      return { success: false, positionId: null, position: null, rejectReason: 'Stop Loss is invalid at the executable entry price' };
    }
    const rawTakeProfit = side === 'LONG'
      ? finalEntryPrice + riskRewardRatio * riskDistance
      : finalEntryPrice - riskRewardRatio * riskDistance;
    const finalTakeProfit = side === 'LONG'
      ? Math.ceil(rawTakeProfit / symbolInfo.tickSize) * symbolInfo.tickSize
      : Math.floor(rawTakeProfit / symbolInfo.tickSize) * symbolInfo.tickSize;
    const takeProfit = roundToTickSize(finalTakeProfit, symbolInfo.tickSize);
    if ((side === 'LONG' && takeProfit <= finalEntryPrice) || (side === 'SHORT' && takeProfit >= finalEntryPrice)) {
      return { success: false, positionId: null, position: null, rejectReason: 'Take Profit target is invalid after tick rounding' };
    }

    // Create position and fee record in transaction
    const result = await prisma.$transaction(async (tx) => {
      const position = await tx.position.create({
        data: {
          id: positionId,
          accountId,
          symbol,
          side,
          status: 'OPEN',
          entryPrice: finalEntryPrice,
          quantity: sizing.quantity,
          leverage: config.leverage,
          margin,
          stopLoss: finalStopLoss,
          takeProfit,
          riskRewardRatio,
          initialRiskBudget: sizing.riskBudget,
          entryTime: now,
          entryNotional,
          entryFee,
          totalFees: entryFee,
          strategyRunId,
          signalId,
          idempotencyKey,
        },
      });

      // Record entry fee
      const feeKey = `fee:entry:${positionId}`;
      await tx.feeEvent.create({
        data: {
          id: uuid(),
          accountId,
          positionId,
          symbol,
          side: 'ENTRY',
          feeRate: config.takerFee,
          notional: entryNotional,
          feeAmount: entryFee,
          idempotencyKey: feeKey,
        },
      });

      if (signalId) {
        await tx.tradeAnalytics.create({
          data: {
            id: uuid(),
            positionId,
            sourceSignalId: signalId,
            strategyVersion: 'macd-histogram-reversal-v1',
            timeframe: analyticsSnapshot.timeframe || '5m',
            signalSnapshot: (analyticsSnapshot.signal || {}) as object,
            entrySnapshot: {
              tradeId: positionId,
              sourceSignalId: signalId,
              symbol,
              side,
              strategyVersion: 'macd-histogram-reversal-v1',
              timeframe: analyticsSnapshot.timeframe || '5m',
              signalReferencePrice: entryPrice,
              entryFillTime: now.toISOString(),
              entryFillPrice: finalEntryPrice,
              quantity: sizing.quantity,
              initialNotional: entryNotional,
              initialRiskBudget: sizing.riskBudget,
              stopLoss: finalStopLoss,
              takeProfit,
              targetRR: riskRewardRatio,
            },
            previousWave: (analyticsSnapshot.previousWave || {}) as object,
          },
        });
      }

      // Update account balance (deduct entry fee)
      await tx.account.update({
        where: { id: accountId },
        data: {
          balance: { decrement: entryFee },
          totalFees: { increment: entryFee },
        },
      });

      return position;
    });

    logger.info(`[Exec] Opened ${side} ${symbol}: qty=${sizing.quantity} @ ${finalEntryPrice}, SL=${finalStopLoss}`);

    return {
      success: true,
      positionId,
      position: mapDbPosition(result),
      rejectReason: null,
    };
  } catch (error) {
    logger.error(`[Exec] Entry error for ${symbol}`, error);
    return {
      success: false,
      positionId: null,
      position: null,
      rejectReason: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Execute a simulated exit (Stop Loss, Take Profit or Manual)
 */
export async function executeExit(
  positionId: string,
  exitPrice: number,
  reason: ExitReason,
  symbolInfo?: SymbolInfo,
  takerFee: number = 0.001,
  slippage: number = 0.0005,
  exitIndicators?: { timeframe: string; timestamp: number | null; values: Record<string, number | null>; unavailableReason?: string }
): Promise<FillResult> {
  try {
    const position = await prisma.position.findUnique({
      where: { id: positionId },
    });

    if (!position || position.status !== 'OPEN') {
      return {
        success: false,
        positionId,
        position: null,
        rejectReason: 'Position not found or already closed',
      };
    }

    const side = position.side as Side;

    // Apply slippage to exit (adverse direction)
    const slippedExitPrice = side === 'LONG'
      ? exitPrice * (1 - slippage) // Worse for LONG
      : exitPrice * (1 + slippage); // Worse for SHORT

    const tickSize = symbolInfo?.tickSize || 0.01;
    const finalExitPrice = roundToTickSize(slippedExitPrice, tickSize);

    const exitNotional = position.quantity * finalExitPrice;
    const exitFee = exitNotional * takerFee;

    // Gross PnL
    const grossPnl = side === 'LONG'
      ? position.quantity * (finalExitPrice - position.entryPrice)
      : position.quantity * (position.entryPrice - finalExitPrice);

    const totalFees = position.entryFee + exitFee;
    const netPnl = grossPnl - totalFees - position.fundingPaid;
    const pnlPercent = (netPnl / position.margin) * 100;

    const now = new Date();
    const feeKey = `fee:exit:${positionId}`;
    const accountBefore = await prisma.account.findUnique({ where: { id: position.accountId }, select: { balance: true } });

    const result = await prisma.$transaction(async (tx) => {
      const updated = await tx.position.update({
        where: { id: positionId },
        data: {
          status: 'CLOSED',
          exitPrice: finalExitPrice,
          exitTime: now,
          exitNotional,
          exitFee,
          realizedGrossPnl: grossPnl,
          totalFees,
          netPnl,
          pnlPercent,
          exitReason: reason,
        },
      });

      // Record exit fee
      await tx.feeEvent.create({
        data: {
          id: uuid(),
          accountId: position.accountId,
          positionId,
          symbol: position.symbol,
          side: 'EXIT',
          feeRate: takerFee,
          notional: exitNotional,
          feeAmount: exitFee,
          idempotencyKey: feeKey,
        },
      });

      // Update account balance
      await tx.account.update({
        where: { id: position.accountId },
        data: {
          balance: { increment: grossPnl - exitFee },
          realizedPnl: { increment: grossPnl },
          totalFees: { increment: exitFee },
        },
      });

      const analytics = await tx.tradeAnalytics.findUnique({ where: { positionId } });
      if (analytics) {
        await tx.tradeAnalytics.update({
          where: { positionId },
          data: {
            exitSnapshot: {
              exitTimestamp: now.toISOString(),
              exitReason: reason,
              stopLossTarget: position.stopLoss,
              takeProfitTarget: position.takeProfit,
              actualExitFillPrice: finalExitPrice,
              exitReferencePrice: exitPrice,
              slippage: finalExitPrice - exitPrice,
              quantity: position.quantity,
              grossRealizedPnl: grossPnl,
              entryFee: position.entryFee,
              exitFee,
              totalFees,
              fundingPaid: position.fundingPaid,
              netRealizedPnl: netPnl,
              targetR: position.riskRewardRatio,
              grossR: position.initialRiskBudget > 0 ? grossPnl / position.initialRiskBudget : null,
              netR: position.initialRiskBudget > 0 ? netPnl / position.initialRiskBudget : null,
              emaSnapshot: exitIndicators ?? { timeframe: null, timestamp: null, values: {}, unavailableReason: 'Completed-candle EMA values were unavailable at exit' },
              accountBalanceBefore: accountBefore?.balance ?? null,
              accountBalanceAfter: accountBefore ? accountBefore.balance + grossPnl - exitFee : null,
            },
          },
        });
      }

      return updated;
    });

    logger.info(`[Exec] Closed ${side} ${position.symbol}: PnL=${netPnl.toFixed(4)}, reason=${reason}`);

    return {
      success: true,
      positionId,
      position: mapDbPosition(result),
      rejectReason: null,
    };
  } catch (error) {
    logger.error(`[Exec] Exit error for position ${positionId}`, error);
    return {
      success: false,
      positionId,
      position: null,
      rejectReason: error instanceof Error ? error.message : 'Unknown error',
    };
  }
}

/**
 * Check and execute stop losses for all open positions
 */
export async function checkStopLosses(
  markPrices: Map<string, number>,
  symbolInfoMap: Map<string, SymbolInfo>,
  takerFee: number = 0.001,
  slippage: number = 0.0005,
  exitIndicatorsFor: (symbol: string) => { timeframe: string; timestamp: number | null; values: Record<string, number | null>; unavailableReason?: string } | undefined = () => undefined
): Promise<FillResult[]> {
  const openPositions = await prisma.position.findMany({
    where: { status: 'OPEN' },
  });

  const results: FillResult[] = [];

  for (const pos of openPositions) {
    const currentPrice = markPrices.get(pos.symbol);
    if (!currentPrice) continue;

    const side = pos.side as Side;
    let triggered = false;
    let reason: ExitReason = 'STOP_LOSS';

    if (side === 'LONG' && currentPrice <= pos.stopLoss) {
      triggered = true;
    } else if (side === 'SHORT' && currentPrice >= pos.stopLoss) {
      triggered = true;
    } else if (pos.takeProfit > 0 && side === 'LONG' && currentPrice >= pos.takeProfit) {
      triggered = true;
      reason = 'TAKE_PROFIT';
    } else if (pos.takeProfit > 0 && side === 'SHORT' && currentPrice <= pos.takeProfit) {
      triggered = true;
      reason = 'TAKE_PROFIT';
    }

    if (triggered) {
      logger.info(`[SL] Stop loss triggered for ${pos.symbol} ${side} @ ${currentPrice} (SL: ${pos.stopLoss})`);
      const symbolInfo = symbolInfoMap.get(pos.symbol);
      const result = await executeExit(
        pos.id,
        currentPrice,
        reason,
        symbolInfo,
        takerFee,
        slippage,
        exitIndicatorsFor(pos.symbol)
      );
      results.push(result);
    }
  }

  return results;
}

function mapDbPosition(dbPos: any): Position {
  return {
    id: dbPos.id,
    symbol: dbPos.symbol,
    side: dbPos.side as Side,
    status: dbPos.status as 'OPEN' | 'CLOSED',
    entryPrice: dbPos.entryPrice,
    exitPrice: dbPos.exitPrice,
    quantity: dbPos.quantity,
    leverage: dbPos.leverage,
    margin: dbPos.margin,
    stopLoss: dbPos.stopLoss,
    takeProfit: dbPos.takeProfit,
    riskRewardRatio: dbPos.riskRewardRatio,
    initialRiskBudget: dbPos.initialRiskBudget,
    entryTime: new Date(dbPos.entryTime).getTime(),
    exitTime: dbPos.exitTime ? new Date(dbPos.exitTime).getTime() : null,
    entryNotional: dbPos.entryNotional,
    exitNotional: dbPos.exitNotional,
    unrealizedPnl: 0,
    realizedGrossPnl: dbPos.realizedGrossPnl,
    entryFee: dbPos.entryFee,
    exitFee: dbPos.exitFee,
    totalFees: dbPos.totalFees,
    fundingPaid: dbPos.fundingPaid,
    netPnl: dbPos.netPnl,
    pnlPercent: dbPos.pnlPercent,
    exitReason: dbPos.exitReason,
    strategyRunId: dbPos.strategyRunId,
    signalId: dbPos.signalId,
    createdAt: new Date(dbPos.createdAt).getTime(),
    updatedAt: new Date(dbPos.updatedAt).getTime(),
    analytics: null,
  };
}
