import { NextRequest, NextResponse } from 'next/server';
import { z } from 'zod';
import { getEngine } from '@/server/engine';
import { hasTrustedMutationOrigin } from '@/server/api-security';

const ActionSchema = z.discriminatedUnion('action', [
  z.object({ action: z.literal('read'), notificationId: z.string().uuid() }),
  z.object({ action: z.literal('dismiss'), notificationId: z.string().uuid() }),
  z.object({ action: z.literal('mark-all-read') }),
  z.object({ action: z.literal('confirm-entry'), signalId: z.string().uuid() }),
]);

export async function GET() {
  try {
    const notifications = await getEngine().getNotifications();
    return NextResponse.json({ success: true, data: notifications, timestamp: Date.now() });
  } catch (error) {
    return NextResponse.json({ success: false, error: error instanceof Error ? error.message : 'Unable to load notifications', timestamp: Date.now() }, { status: 500 });
  }
}

export async function POST(request: NextRequest) {
  try {
    if (!hasTrustedMutationOrigin(request)) return NextResponse.json({ success: false, error: 'Cross-origin request rejected' }, { status: 403 });
    const input = ActionSchema.parse(await request.json());
    const engine = getEngine();
    if (input.action === 'mark-all-read') {
      return NextResponse.json(await engine.markAllNotificationsRead());
    }
    if (input.action === 'read' || input.action === 'dismiss') {
      return NextResponse.json(await engine.updateNotification(input.notificationId, input.action));
    }
    const result = await engine.confirmSignal(input.signalId);
    return NextResponse.json({ ...result, timestamp: Date.now() }, { status: result.success ? 200 : 409 });
  } catch (error) {
    const message = error instanceof Error ? error.message : 'Invalid notification action';
    return NextResponse.json({ success: false, error: message, timestamp: Date.now() }, { status: 400 });
  }
}
