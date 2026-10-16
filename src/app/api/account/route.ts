/**
 * API: Account state and snapshots
 */
import { NextResponse } from 'next/server';
import { getEngine } from '@/server/engine';
import { prisma } from '@/server/persistence/prisma';

export async function GET() {
  try {
    const engine = getEngine();
    const account = await engine.getAccountState();

    // Get recent snapshots
    const snapshots = await prisma.accountSnapshot.findMany({
      orderBy: { snapshotTime: 'desc' },
      take: 10,
    });

    // Get previous snapshot for change calculation
    let equityChange: number | null = null;
    if (account && snapshots.length >= 2) {
      const prevSnapshot = snapshots[1]; // Second most recent
      if (prevSnapshot.equity > 0) {
        equityChange = ((account.equity - prevSnapshot.equity) / prevSnapshot.equity) * 100;
      }
    }

    return NextResponse.json({
      success: true,
      data: {
        account,
        snapshots: snapshots.map(s => ({
          id: s.id,
          balance: s.balance,
          equity: s.equity,
          unrealizedPnl: s.unrealizedPnl,
          realizedPnl: s.realizedPnl,
          openPositionsCount: s.openPositionsCount,
          snapshotTime: s.snapshotTime.getTime(),
        })),
        equityChange,
      },
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Unknown error',
        timestamp: Date.now(),
      },
      { status: 500 }
    );
  }
}
