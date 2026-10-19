/** Tests for the configured Binance watchlist. */
import { describe, expect, it } from 'vitest';
import {
  DEFAULT_WATCHLIST,
  getConfiguredWatchlist,
  getEligibleBinanceSymbols,
  mapToEligibleSymbols,
} from '@/server/symbol-universe';

describe('Symbol Universe', () => {
  it('uses the requested watchlist in the requested order by default', () => {
    expect(DEFAULT_WATCHLIST).toEqual([
      'BTC', 'ETH', 'BNB', 'XRP', 'SOL', 'HYPE', 'ZEC', 'DOGE', 'XMR', 'LINK',
      'LEO', 'NEAR', 'XLM', 'BCH', 'UNI', 'AVAX', 'SUI', 'CC', 'GRAM', 'TAO',
      'ENA', 'OKB', 'FET', 'ONDO', 'DOT', 'PUMP', 'ASTER',
    ]);
    expect(getConfiguredWatchlist('')).toEqual(DEFAULT_WATCHLIST);
  });

  it('normalizes and deduplicates a custom environment list', () => {
    expect(getConfiguredWatchlist(' eth, btc,ETH,, ')).toEqual(['ETH', 'BTC']);
    expect(getConfiguredWatchlist(' , ')).toEqual(DEFAULT_WATCHLIST);
  });

  it('maps eligible Binance perpetuals without reordering or capping the list', () => {
    const mapped = mapToEligibleSymbols(
      ['btc', 'missing', 'eth'],
      new Set(['BTCUSDT', 'ETHUSDT'])
    );

    expect(mapped.map(symbol => symbol.binanceSymbol)).toEqual(['BTCUSDT', 'MISSINGUSDT', 'ETHUSDT']);
    expect(mapped.map(symbol => symbol.sortOrder)).toEqual([1, 2, 3]);
    expect(mapped.map(symbol => symbol.eligible)).toEqual([true, false, true]);
    expect(mapped[1].excludeReason).toContain('not found');
    expect(getEligibleBinanceSymbols(mapped)).toEqual(['BTCUSDT', 'ETHUSDT']);
  });
});
