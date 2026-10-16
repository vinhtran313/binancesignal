/**
 * API: Initialize and get engine state
 */
import { NextResponse } from 'next/server';
import { getEngine, initializeEngine } from '@/server/engine';

export const dynamic = 'force-dynamic';

let initialized = false;

export async function GET() {
  try {
    if (!initialized) {
      await initializeEngine();
      initialized = true;
    }

    const engine = getEngine();
    const account = await engine.getAccountState();
    const strategy = engine.getStrategyState();
    const connection = engine.getConnectionStatus();
    const symbols = engine.getMonitoredSymbols();

    return NextResponse.json({
      success: true,
      data: {
        account,
        strategy,
        connection,
        symbols,
        config: engine.getConfig(),
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
