/**
 * Custom hook for SSE connection to the trading engine
 */
'use client';

import { useState, useEffect, useRef, useCallback } from 'react';
import { toast } from 'sonner';
import type {
  AccountState,
  StrategyState,
  ConnectionStatus,
  Position,
  Candle,
  Timeframe,
  NotificationRecord,
  TradingConfig,
} from '@/shared/types';

export interface LiveCandleUpdate {
  symbol: string;
  timeframe: Timeframe;
  candle: Candle;
}

interface EngineState {
  account: AccountState | null;
  strategy: StrategyState | null;
  connection: ConnectionStatus;
  positions: Position[];
  isConnected: boolean;
  error: string | null;
  /** Most recent candle received over SSE (for live chart updates) */
  lastCandle: LiveCandleUpdate | null;
  /** Live mark prices keyed by symbol */
  markPrices: Record<string, number>;
  lastPrices: Record<string, number>;
  notifications: NotificationRecord[];
  config: TradingConfig | null;
  symbols: string[];
}

export function useEngineStream(symbol: string, timeframe: Timeframe) {
  const [state, setState] = useState<EngineState>({
    account: null,
    strategy: null,
    connection: 'DISCONNECTED',
    positions: [],
    isConnected: false,
    error: null,
    lastCandle: null,
    markPrices: {},
    lastPrices: {},
    notifications: [],
    config: null,
    symbols: [],
  });

  const eventSourceRef = useRef<EventSource | null>(null);
  const reconnectTimerRef = useRef<NodeJS.Timeout | null>(null);
  const connectRef = useRef<() => void>(() => {});
  const notificationIdsRef = useRef<Set<string>>(new Set());
  const notificationsLoadedRef = useRef(false);
  const chartSelectionRef = useRef({ symbol, timeframe });
  const pendingPricesRef = useRef<{ markPrices: Record<string, number>; lastPrices: Record<string, number> }>({
    markPrices: {},
    lastPrices: {},
  });
  const priceFlushTimerRef = useRef<NodeJS.Timeout | null>(null);

  const queuePriceUpdate = useCallback((kind: 'markPrices' | 'lastPrices', symbol: string, price: number) => {
    pendingPricesRef.current[kind][symbol] = price;
    if (priceFlushTimerRef.current) return;

    priceFlushTimerRef.current = setTimeout(() => {
      const pending = pendingPricesRef.current;
      pendingPricesRef.current = { markPrices: {}, lastPrices: {} };
      priceFlushTimerRef.current = null;
      setState(prev => ({
        ...prev,
        markPrices: Object.keys(pending.markPrices).length ? { ...prev.markPrices, ...pending.markPrices } : prev.markPrices,
        lastPrices: Object.keys(pending.lastPrices).length ? { ...prev.lastPrices, ...pending.lastPrices } : prev.lastPrices,
      }));
    }, 200);
  }, []);

  useEffect(() => {
    chartSelectionRef.current = { symbol, timeframe };
  }, [symbol, timeframe]);

  const connect = useCallback(() => {
    if (eventSourceRef.current) {
      eventSourceRef.current.close();
    }

    const es = new EventSource('/api/stream');
    eventSourceRef.current = es;

    es.onopen = () => {
      setState(prev => ({ ...prev, isConnected: true, error: null }));
    };

    es.onmessage = (event) => {
      try {
        const data = JSON.parse(event.data);
        if (data.type === 'candle') {
          if (data.timeframe === '1m') queuePriceUpdate('lastPrices', data.symbol, data.candle.close);
          if (data.symbol === chartSelectionRef.current.symbol && data.timeframe === chartSelectionRef.current.timeframe) {
            setState(prev => ({ ...prev, lastCandle: { symbol: data.symbol, timeframe: data.timeframe, candle: data.candle } }));
          }
          return;
        }
        if (data.type === 'markPrice') {
          queuePriceUpdate('markPrices', data.symbol, data.markPrice);
          return;
        }
        if (data.type === 'notifications') {
          const notifications = data.notifications as NotificationRecord[];
          if (notificationsLoadedRef.current) {
            for (const item of notifications) {
              if (notificationIdsRef.current.has(item.id) || item.readAt) continue;
              const side = item.signal.action === 'ENTRY_LONG' ? 'LONG' : 'SHORT';
              toast.info(`New signal · ${item.signal.symbol} ${side} · ${item.signal.timeframe}`, {
                description: `${item.signal.strengthScore}/100 ${item.signal.strengthLabel} · ${item.signal.tradeId ? 'Paper position opened' : item.signal.rejectReason || item.signal.result}`,
                ...(item.signal.result === 'ACTIONABLE' ? { action: {
                  label: 'Review',
                  onClick: () => window.dispatchEvent(new CustomEvent('notification:review', { detail: { signalId: item.signalId } })),
                } } : {}),
                duration: 10_000,
                id: `signal-${item.signalId}`,
              });
            }
          }
          notificationIdsRef.current = new Set(notifications.map(item => item.id));
          notificationsLoadedRef.current = true;
          setState(prev => ({ ...prev, notifications }));
          return;
        }

        setState(prev => {
          switch (data.type) {
            case 'account':
              return { ...prev, account: data.account };
            case 'strategy':
              return { ...prev, strategy: data.state };
            case 'connection':
              return { ...prev, connection: data.status };
            case 'positions':
              return { ...prev, positions: data.positions };
            case 'config':
              return { ...prev, config: data.config };
            case 'symbols':
              return { ...prev, symbols: data.symbols };
            case 'position':
              return {
                ...prev,
                positions: prev.positions.map(p =>
                  p.id === data.position.id ? data.position : p
                ),
              };
            case 'heartbeat':
              return prev; // Just keep alive
            default:
              return prev;
          }
        });
      } catch (e) {
        // Ignore parse errors
      }
    };

    es.onerror = () => {
      setState(prev => ({ ...prev, isConnected: false }));
      es.close();

      // Reconnect after delay
      reconnectTimerRef.current = setTimeout(() => {
        connectRef.current();
      }, 3000);
    };
  }, [queuePriceUpdate]);
  useEffect(() => {
    connectRef.current = connect;
    // Initialize engine first
    fetch('/api/engine').then(res => res.json()).then(json => {
      if (json.success && json.data) setState(prev => ({ ...prev, config: json.data.config ?? null, symbols: json.data.symbols ?? [] }));
      connect();
    }).catch(err => {
      setState(prev => ({ ...prev, error: 'Failed to initialize engine' }));
    });

    return () => {
      eventSourceRef.current?.close();
      if (reconnectTimerRef.current) {
        clearTimeout(reconnectTimerRef.current);
      }
      if (priceFlushTimerRef.current) clearTimeout(priceFlushTimerRef.current);
    };
  }, [connect]);

  return state;
}
