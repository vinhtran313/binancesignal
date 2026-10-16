/**
 * Binance Futures REST API client for market data
 */

import type { Candle, SymbolInfo, MarkPrice, FundingRate, Timeframe } from '@/shared/types';
import { BINANCE_FUTURES_BASE } from '@/shared/types';

const BASE = BINANCE_FUTURES_BASE;

export async function fetchKlines(
  symbol: string,
  interval: Timeframe,
  limit: number = 1000,
  startTime?: number,
  endTime?: number
): Promise<Candle[]> {
  const params = new URLSearchParams({
    symbol,
    interval,
    limit: String(Math.min(limit, 1500)),
  });
  if (startTime) params.set('startTime', String(startTime));
  if (endTime) params.set('endTime', String(endTime));

  const res = await fetch(`${BASE}/fapi/v1/klines?${params}`);
  if (!res.ok) {
    throw new Error(`Binance klines error: ${res.status} ${await res.text()}`);
  }

  const data = await res.json();
  return data.map((k: any[]) => ({
    openTime: k[0],
    open: parseFloat(k[1]),
    high: parseFloat(k[2]),
    low: parseFloat(k[3]),
    close: parseFloat(k[4]),
    volume: parseFloat(k[5]),
    closeTime: k[6],
    quoteVolume: parseFloat(k[7]),
    trades: k[8],
    isClosed: k[6] < Date.now(),
  }));
}

export async function fetchExchangeInfo(): Promise<SymbolInfo[]> {
  const res = await fetch(`${BASE}/fapi/v1/exchangeInfo`);
  if (!res.ok) {
    throw new Error(`Binance exchangeInfo error: ${res.status}`);
  }

  const data = await res.json();
  return data.symbols
    .filter((s: any) => s.contractType === 'PERPETUAL' && s.quoteAsset === 'USDT' && s.status === 'TRADING')
    .map((s: any) => {
      const priceFilter = s.filters.find((f: any) => f.filterType === 'PRICE_FILTER');
      const lotSize = s.filters.find((f: any) => f.filterType === 'LOT_SIZE');
      const minNotional = s.filters.find((f: any) => f.filterType === 'MIN_NOTIONAL');

      return {
        symbol: s.symbol,
        baseAsset: s.baseAsset,
        quoteAsset: s.quoteAsset,
        pricePrecision: s.pricePrecision,
        quantityPrecision: s.quantityPrecision,
        tickSize: parseFloat(priceFilter?.tickSize || '0.01'),
        stepSize: parseFloat(lotSize?.stepSize || '0.001'),
        minQty: parseFloat(lotSize?.minQty || '0.001'),
        maxQty: parseFloat(lotSize?.maxQty || '100000'),
        minNotional: parseFloat(minNotional?.notional || '5'),
        status: s.status,
      };
    });
}

export async function fetchMarkPrice(symbol?: string): Promise<MarkPrice[]> {
  const url = symbol
    ? `${BASE}/fapi/v1/premiumIndex?symbol=${symbol}`
    : `${BASE}/fapi/v1/premiumIndex`;
  const res = await fetch(url);
  if (!res.ok) {
    throw new Error(`Binance markPrice error: ${res.status}`);
  }

  const data = await res.json();
  const items = Array.isArray(data) ? data : [data];
  return items.map((d: any) => ({
    symbol: d.symbol,
    markPrice: parseFloat(d.markPrice),
    indexPrice: parseFloat(d.indexPrice),
    lastFundingRate: parseFloat(d.lastFundingRate),
    nextFundingTime: d.nextFundingTime,
    timestamp: d.time,
  }));
}

export async function fetchFundingRate(symbol: string, limit: number = 1): Promise<FundingRate[]> {
  const res = await fetch(
    `${BASE}/fapi/v1/fundingRate?symbol=${symbol}&limit=${limit}`
  );
  if (!res.ok) {
    throw new Error(`Binance fundingRate error: ${res.status}`);
  }

  const data = await res.json();
  return data.map((d: any) => ({
    symbol: d.symbol,
    fundingRate: parseFloat(d.fundingRate),
    fundingTime: d.fundingTime,
    markPrice: parseFloat(d.markPrice || '0'),
  }));
}

/**
 * Fetch enough candles for EMA 610 warmup
 * May require multiple API calls
 */
export async function fetchHistoricalCandles(
  symbol: string,
  interval: Timeframe,
  requiredCount: number = 750
): Promise<Candle[]> {
  const allCandles: Candle[] = [];
  let endTime: number | undefined;
  const batchSize = 1500;

  while (allCandles.length < requiredCount) {
    const remaining = requiredCount - allCandles.length;
    const limit = Math.min(remaining, batchSize);

    const candles = await fetchKlines(symbol, interval, limit, undefined, endTime);
    if (candles.length === 0) break;

    allCandles.unshift(...candles);
    endTime = candles[0].openTime - 1;

    // Rate limit
    await new Promise(r => setTimeout(r, 200));
  }

  // Remove duplicates by openTime
  const seen = new Set<number>();
  return allCandles.filter(c => {
    if (seen.has(c.openTime)) return false;
    seen.add(c.openTime);
    return true;
  });
}
