/**
 * API: Server-Sent Events stream for real-time updates
 */
import { NextRequest } from 'next/server';
import { getEngine } from '@/server/engine';

export const dynamic = 'force-dynamic';

export async function GET(req: NextRequest) {
  const encoder = new TextEncoder();

  const stream = new ReadableStream({
    start(controller) {
      const engine = getEngine();

      const sendEvent = (data: any) => {
        try {
          const eventData = `data: ${JSON.stringify(data)}\n\n`;
          controller.enqueue(encoder.encode(eventData));
        } catch (e) {
          // Stream closed
        }
      };

      // Send initial state
      (async () => {
        try {
          const account = await engine.getAccountState();
          if (account) sendEvent({ type: 'account', account });

          const strategy = engine.getStrategyState();
          sendEvent({ type: 'strategy', state: strategy });
          sendEvent({ type: 'config', config: engine.getConfig() });
          sendEvent({ type: 'symbols', symbols: engine.getMonitoredSymbols() });

          sendEvent({ type: 'connection', status: engine.getConnectionStatus() });

          const positions = await engine.getPositions();
          sendEvent({ type: 'positions', positions });
          const notifications = await engine.getNotifications();
          sendEvent({ type: 'notifications', notifications });
        } catch (e) {
          // ignore init errors
        }
      })();

      // Register listener
      const listener = (data: any) => {
        if (data.type === 'notifications:refresh') {
          void engine.getNotifications().then(notifications => sendEvent({ type: 'notifications', notifications }));
        } else sendEvent(data);
      };
      engine.addStateListener(listener);

      // Heartbeat
      const heartbeat = setInterval(() => {
        try {
          sendEvent({ type: 'heartbeat', timestamp: Date.now() });
        } catch (e) {
          clearInterval(heartbeat);
        }
      }, 30000);

      // Periodic account state refresh
      const accountRefresh = setInterval(async () => {
        try {
          const account = await engine.getAccountState();
          if (account) sendEvent({ type: 'account', account });
        } catch (e) {
          // ignore
        }
      }, 5000);

      // Cleanup
      req.signal.addEventListener('abort', () => {
        clearInterval(heartbeat);
        clearInterval(accountRefresh);
        engine.removeStateListener(listener);
      });
    },
  });

  return new Response(stream, {
    headers: {
      'Content-Type': 'text/event-stream',
      'Cache-Control': 'no-cache',
      'Connection': 'keep-alive',
    },
  });
}
