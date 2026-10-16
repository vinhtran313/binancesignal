/**
 * Hook for fetching market data (candles + indicators)
 */
'use client';

import { useState, useEffect, useCallback, useRef } from 'react';
import type { Candle, Timeframe, IndicatorSeries, SymbolInfo } from '@/shared/types';

interface MarketData {
  requestKey: string;
  candles: Candle[];
  indicators: IndicatorSeries | null;
  markPrice: number | null;
  symbolInfo: SymbolInfo | null;
  loading: boolean;
  error: string | null;
}

export function useMarketData(symbol: string, timeframe: Timeframe) {
  const requestKey = `${symbol}:${timeframe}`;
  const [data, setData] = useState<MarketData>({
    requestKey: '',
    candles: [],
    indicators: null,
    markPrice: null,
    symbolInfo: null,
    loading: true,
    error: null,
  });

  const intervalRef = useRef<NodeJS.Timeout | null>(null);

  const fetchData = useCallback(async () => {
    try {
      const res = await fetch(`/api/market?symbol=${symbol}&timeframe=${timeframe}`);
      if (!res.ok) throw new Error(`HTTP ${res.status}`);

      const json = await res.json();
      if (json.success && json.data) {
        setData({
          requestKey,
          candles: json.data.candles || [],
          indicators: json.data.indicators || null,
          markPrice: json.data.markPrice || null,
          symbolInfo: json.data.symbolInfo || null,
          loading: false,
          error: null,
        });
      }
    } catch (error) {
      setData(prev => prev.requestKey === requestKey
        ? { ...prev, loading: false, error: error instanceof Error ? error.message : 'Failed to fetch market data' }
        : { requestKey, candles: [], indicators: null, markPrice: null, symbolInfo: null, loading: false, error: error instanceof Error ? error.message : 'Failed to fetch market data' });
    }
  }, [symbol, timeframe]);

  useEffect(() => {
    setData(prev => ({ ...prev, loading: true }));
    fetchData();

    // WebSocket/SSE carries live candles; REST polling is only a slow recovery sync.
    intervalRef.current = setInterval(fetchData, 30_000);

    return () => {
      if (intervalRef.current) {
        clearInterval(intervalRef.current);
      }
    };
  }, [fetchData]);

  if (data.requestKey === requestKey) return data;
  return { requestKey, candles: [], indicators: null, markPrice: null, symbolInfo: null, loading: true, error: null };
}
