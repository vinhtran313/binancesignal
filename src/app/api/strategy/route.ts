/**
 * API: Strategy controls
 */
import { NextRequest, NextResponse } from 'next/server';
import { getEngine } from '@/server/engine';
import { StrategyActionSchema, StrategyConfigSchema } from '@/shared/schemas';
import { hasTrustedMutationOrigin } from '@/server/api-security';
import { z } from 'zod';

export async function POST(req: NextRequest) {
  try {
    if (!hasTrustedMutationOrigin(req)) return NextResponse.json({ success: false, error: 'Cross-origin request rejected' }, { status: 403 });
    const body = await req.json();
    const { action } = z.object({ action: StrategyActionSchema }).parse(body);

    const engine = getEngine();

    switch (action) {
      case 'start': {
        const config = StrategyConfigSchema.parse(body.config || {});
        await engine.startStrategy(config.timeframe, config);
        break;
      }
      case 'pause':
        await engine.pauseStrategy();
        break;
      case 'resume':
        await engine.resumeStrategy();
        break;
      case 'stop':
        await engine.stopStrategy();
        break;
    }

    return NextResponse.json({
      success: true,
      data: engine.getStrategyState(),
      timestamp: Date.now(),
    });
  } catch (error) {
    return NextResponse.json(
      {
        success: false,
        error: error instanceof Error ? error.message : 'Invalid request',
        timestamp: Date.now(),
      },
      { status: 400 }
    );
  }
}

export async function GET() {
  const engine = getEngine();
  return NextResponse.json({
    success: true,
    data: engine.getStrategyState(),
    timestamp: Date.now(),
  });
}
