/**
 * API: Positions and trade history
 */
import { NextRequest, NextResponse } from 'next/server';
import { getEngine } from '@/server/engine';
import { ClosePositionSchema } from '@/shared/schemas';
import { hasTrustedMutationOrigin } from '@/server/api-security';

export async function GET(req: NextRequest) {
  try {
    const engine = getEngine();
    const positions = await engine.getPositions();

    return NextResponse.json({
      success: true,
      data: positions,
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

export async function POST(req: NextRequest) {
  try {
    if (!hasTrustedMutationOrigin(req)) return NextResponse.json({ success: false, error: 'Cross-origin request rejected' }, { status: 403 });
    const body = await req.json();
    const { positionId, reason } = ClosePositionSchema.parse(body);

    const engine = getEngine();
    const result = await engine.closePosition(positionId, reason);

    return NextResponse.json({
      success: result.success,
      data: result.position,
      error: result.rejectReason,
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
