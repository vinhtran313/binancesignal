/**
 * Accounting module - PnL, funding, balance management, snapshots
 */

import { prisma } from '../persistence/prisma';
import { logger } from '../utils/logger';
import { v4 as uuid } from 'uuid';
import type { Side, AccountState, AccountSnapshot, Position } from '@/shared/types';

/**
 * Get current account state with unrealized PnL
 */
export async function getAccountState(
  accountId: string,
  markPrices: Map<string, number>,
  maxPositions: number = 10
): Promise<AccountState | null> {
  const account = await prisma.account.findUnique({
    where: { id: accountId },
    include: {
      positions: { where: { status: 'OPEN' } },
    },
  });

  if (!account) return null;

  let unrealizedPnl = 0;
  let usedMargin = 0;

  for (const pos of account.positions) {
    const markPrice = markPrices.get(pos.symbol) || pos.entryPrice;
    const side = pos.side as Side;

    const uPnl = side === 'LONG'
      ? pos.quantity * (markPrice - pos.entryPrice)
      : pos.quantity * (pos.entryPrice - markPrice);

    unrealizedPnl += uPnl;
    usedMargin += pos.margin;
  }

  const equity = account.balance + unrealizedPnl;
  const availableBalance = equity - usedMargin;
  const previousSnapshot = await prisma.accountSnapshot.findFirst({
    where: { accountId, snapshotTime: { lte: new Date() } },
    orderBy: { snapshotTime: 'desc' },
    select: { equity: true },
  });

  return {
    id: account.id,
    initialBalance: account.initialBalance,
    balance: account.balance,
    equity,
    availableBalance: Math.max(0, availableBalance),
    usedMargin,
    realizedPnl: account.realizedPnl,
    unrealizedPnl,
    totalFees: account.totalFees,
    totalFunding: account.totalFunding,
    openPositionsCount: account.positions.length,
    maxPositions,
    snapshotChangePercent: previousSnapshot && previousSnapshot.equity !== 0
      ? ((equity - previousSnapshot.equity) / previousSnapshot.equity) * 100
      : null,
    updatedAt: account.updatedAt.getTime(),
  };
}

/**
 * Initialize or get the default account
 */
export async function ensureAccount(initialBalance: number = 500): Promise<string> {
  let account = await prisma.account.findFirst();
  if (!account) {
    account = await prisma.account.create({
      data: {
        id: uuid(),
        name: 'Paper Trading',
        balance: initialBalance,
        initialBalance,
      },
    });
    logger.info(`[Account] Created paper trading account: ${account.id}`);
  }
  return account.id;
}

/**
 * Create an account snapshot at a fixed 15-minute boundary
 */
export async function createSnapshot(
  accountId: string,
  markPrices: Map<string, number>,
  snapshotTime: Date
): Promise<AccountSnapshot | null> {
  // Check idempotency
  const existing = await prisma.accountSnapshot.findUnique({
    where: {
      accountId_snapshotTime: {
        accountId,
        snapshotTime,
      },
    },
  });

  if (existing) {
    return mapDbSnapshot(existing);
  }

  const state = await getAccountState(accountId, markPrices);
  if (!state) return null;

  const snapshot = await prisma.accountSnapshot.create({
    data: {
      id: uuid(),
      accountId,
      balance: state.balance,
      equity: state.equity,
      unrealizedPnl: state.unrealizedPnl,
      realizedPnl: state.realizedPnl,
      totalFees: state.totalFees,
      totalFunding: state.totalFunding,
      openPositionsCount: state.openPositionsCount,
      snapshotTime,
    },
  });

  logger.info(`[Snapshot] Created snapshot at ${snapshotTime.toISOString()}: equity=${state.equity.toFixed(2)}`);
  return mapDbSnapshot(snapshot);
}

/**
 * Get the previous snapshot for comparison
 */
export async function getPreviousSnapshot(
  accountId: string,
  beforeTime: Date
): Promise<AccountSnapshot | null> {
  const snapshot = await prisma.accountSnapshot.findFirst({
    where: {
      accountId,
      snapshotTime: { lt: beforeTime },
    },
    orderBy: { snapshotTime: 'desc' },
  });

  return snapshot ? mapDbSnapshot(snapshot) : null;
}

/**
 * Calculate the next 15-minute boundary (strictly in the future)
 */
export function getNext15MinBoundary(now: Date = new Date()): Date {
  const ms = now.getTime();
  const interval = 15 * 60 * 1000;
  const currentBoundary = Math.floor(ms / interval) * interval;
  return new Date(currentBoundary + interval);
}

/**
 * Get current 15-minute boundary
 */
export function getCurrent15MinBoundary(now: Date = new Date()): Date {
  const ms = now.getTime();
  const interval = 15 * 60 * 1000;
  const boundary = Math.floor(ms / interval) * interval;
  return new Date(boundary);
}

/**
 * Process funding for a position at funding time
 */
export async function processFunding(
  accountId: string,
  positionId: string,
  symbol: string,
  fundingRate: number,
  markPrice: number,
  fundingTime: Date,
  positionQty: number,
  side: Side
): Promise<void> {
  const idempKey = `funding:${positionId}:${fundingTime.getTime()}`;

  // Check idempotency
  const existing = await prisma.fundingEvent.findUnique({
    where: { idempotencyKey: idempKey },
  });
  if (existing) return;

  // For LONG: pay funding rate (positive rate = pay, negative rate = receive)
  // For SHORT: receive funding rate (positive rate = receive, negative rate = pay)
  const positionNotional = positionQty * markPrice;
  let payment: number;

  if (side === 'LONG') {
    payment = positionNotional * fundingRate; // positive = pay
  } else {
    payment = -(positionNotional * fundingRate); // negative = pay for short when rate is negative
  }

  await prisma.$transaction(async (tx) => {
    await tx.fundingEvent.create({
      data: {
        id: uuid(),
        accountId,
        positionId,
        symbol,
        fundingRate,
        positionSize: positionQty,
        markPrice,
        payment,
        fundingTime,
        idempotencyKey: idempKey,
      },
    });

    // Update position funding
    await tx.position.update({
      where: { id: positionId },
      data: {
        fundingPaid: { increment: payment },
      },
    });

    // Update account
    await tx.account.update({
      where: { id: accountId },
      data: {
        balance: { decrement: payment },
        totalFunding: { increment: payment },
      },
    });
  });

  logger.info(`[Funding] ${symbol} ${side}: rate=${fundingRate}, payment=${payment.toFixed(6)}`);
}

/**
 * Get all positions with unrealized PnL
 */
export async function getPositionsWithPnl(
  accountId: string,
  markPrices: Map<string, number>
): Promise<Position[]> {
  const positions = await prisma.position.findMany({
    where: { accountId },
    include: { analytics: true },
    orderBy: { entryTime: 'desc' },
  });

  return positions.map(pos => {
    const side = pos.side as Side;
    let unrealizedPnl = 0;

    if (pos.status === 'OPEN') {
      const markPrice = markPrices.get(pos.symbol) || pos.entryPrice;
      unrealizedPnl = side === 'LONG'
        ? pos.quantity * (markPrice - pos.entryPrice)
        : pos.quantity * (pos.entryPrice - markPrice);
    }

    return {
      id: pos.id,
      symbol: pos.symbol,
      side,
      status: pos.status as 'OPEN' | 'CLOSED',
      entryPrice: pos.entryPrice,
      exitPrice: pos.exitPrice,
      quantity: pos.quantity,
      leverage: pos.leverage,
      margin: pos.margin,
      stopLoss: pos.stopLoss,
      takeProfit: pos.takeProfit,
      riskRewardRatio: pos.riskRewardRatio,
      initialRiskBudget: pos.initialRiskBudget,
      entryTime: pos.entryTime.getTime(),
      exitTime: pos.exitTime?.getTime() || null,
      entryNotional: pos.entryNotional,
      exitNotional: pos.exitNotional,
      unrealizedPnl,
      realizedGrossPnl: pos.realizedGrossPnl,
      entryFee: pos.entryFee,
      exitFee: pos.exitFee,
      totalFees: pos.totalFees,
      fundingPaid: pos.fundingPaid,
      netPnl: pos.netPnl,
      pnlPercent: pos.pnlPercent,
      exitReason: pos.exitReason as any,
      strategyRunId: pos.strategyRunId,
      signalId: pos.signalId,
      createdAt: pos.createdAt.getTime(),
      updatedAt: pos.updatedAt.getTime(),
      analytics: pos.analytics ? {
        strategyVersion: pos.analytics.strategyVersion,
        timeframe: pos.analytics.timeframe,
        signalSnapshot: pos.analytics.signalSnapshot,
        entrySnapshot: pos.analytics.entrySnapshot,
        previousWave: pos.analytics.previousWave,
        exitSnapshot: pos.analytics.exitSnapshot,
      } : null,
    };
  });
}

function mapDbSnapshot(s: any): AccountSnapshot {
  return {
    id: s.id,
    accountId: s.accountId,
    balance: s.balance,
    equity: s.equity,
    unrealizedPnl: s.unrealizedPnl,
    realizedPnl: s.realizedPnl,
    totalFees: s.totalFees,
    totalFunding: s.totalFunding,
    openPositionsCount: s.openPositionsCount,
    snapshotTime: s.snapshotTime.getTime(),
    createdAt: s.createdAt.getTime(),
  };
}
