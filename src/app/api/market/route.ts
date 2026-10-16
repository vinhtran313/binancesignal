/**
 * API: Market data - candles and indicators
 */
import { NextRequest, NextResponse } from 'next/server';
import { getEngine, initializeEngine } from '@/server/engine';
import { TimeframeSchema } from '@/shared/schemas';
import { z } from 'zod';

export async function GET(req: NextRequest) {
  try {
    const { searchParams } = new URL(req.url);
    const symbol = searchParams.get('symbol') || 'BTCUSDT';
    const timeframe = TimeframeSchema.parse(searchParams.get('timeframe') || '5m');

    await initializeEngine();
    const engine = getEngine();
    const candles = await engine.ensureCandleHistory(symbol, timeframe);
    const indicators = engine.getIndicators(symbol, timeframe);
    const markPrice = engine.getMarkPrices().get(symbol);
    const symbolInfo = engine.getSymbolInfo(symbol);

    return NextResponse.json({
      success: true,
      data: {
        symbol,
        timeframe,
        candles: candles.slice(-500), // Last 500 candles for chart
        indicators: indicators ? {
          ema34: indicators.ema34.slice(-500),
          ema89: indicators.ema89.slice(-500),
          ema200: indicators.ema200.slice(-500),
          ema610: indicators.ema610.slice(-500),
          rsi14: indicators.rsi14.slice(-500),
          macdLine: indicators.macdLine.slice(-500),
          macdSignal: indicators.macdSignal.slice(-500),
          macdHistogram: indicators.macdHistogram.slice(-500),
        } : null,
        markPrice,
        symbolInfo,
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
