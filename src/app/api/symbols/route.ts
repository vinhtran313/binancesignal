/**
 * API: Symbol list
 */
import { NextResponse } from 'next/server';
import { getEngine } from '@/server/engine';

export const dynamic = 'force-dynamic';

export async function GET() {
  try {
    const engine = getEngine();
    const symbols = engine.getMonitoredSymbols();
    const markPrices = engine.getMarkPrices();

    const data = symbols.map(symbol => ({
      symbol,
      markPrice: markPrices.get(symbol) || null,
      symbolInfo: engine.getSymbolInfo(symbol) || null,
    }));

    return NextResponse.json({
      success: true,
      data,
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
