/**
 * User selected watchlist mapped to active Binance USDT perpetuals.
 * Set WATCHLIST_SYMBOLS to a comma-separated list to customize the default.
 */

import type { SymbolMapping } from '@/shared/types';

export const DEFAULT_WATCHLIST = [
  'BTC', 'ETH', 'BNB', 'XRP', 'SOL', 'HYPE', 'ZEC', 'DOGE', 'XMR', 'LINK',
  'LEO', 'NEAR', 'XLM', 'BCH', 'UNI', 'AVAX', 'SUI', 'CC', 'GRAM', 'TAO',
  'ENA', 'OKB', 'FET', 'ONDO', 'DOT', 'PUMP', 'ASTER',
] as const;

export function getConfiguredWatchlist(value = process.env.WATCHLIST_SYMBOLS): string[] {
  const configured = value?.split(',').map(asset => asset.trim().toUpperCase()).filter(Boolean);
  const assets = configured?.length ? configured : [...DEFAULT_WATCHLIST];
  return [...new Set(assets)];
}

/** Resolve the configured order against current Binance exchange information. */
export function mapToEligibleSymbols(assets: string[], exchangeSymbols: Set<string>): SymbolMapping[] {
  return assets.map((rawAsset, index) => {
    const asset = rawAsset.trim().toUpperCase();
    const binanceSymbol = `${asset}USDT`;
    const eligible = exchangeSymbols.has(binanceSymbol);
    return {
      coinId: asset.toLowerCase(),
      symbol: asset,
      binanceSymbol,
      sortOrder: index + 1,
      eligible,
      excludeReason: eligible ? null : `${binanceSymbol} not found on Binance Futures`,
    };
  });
}

export async function getSymbolUniverse(exchangeSymbols: Set<string>): Promise<SymbolMapping[]> {
  return mapToEligibleSymbols(getConfiguredWatchlist(), exchangeSymbols);
}

export function getEligibleBinanceSymbols(universe: SymbolMapping[]): string[] {
  return universe.filter(symbol => symbol.eligible).map(symbol => symbol.binanceSymbol);
}
