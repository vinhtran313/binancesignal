/**
 * Symbol Universe - Top 20 market cap mapping to Binance USDT perpetuals
 */

import type { SymbolMapping, SymbolInfo } from '@/shared/types';
import { prisma } from '../persistence/prisma';
import { logger } from '../utils/logger';
import { v4 as uuid } from 'uuid';

// Stablecoins and assets without USDT perpetuals
const EXCLUDED_ASSETS = new Set(['USDT', 'USDC', 'DAI', 'BUSD', 'TUSD', 'FDUSD']);

/**
 * Fetch top coins from CoinGecko (free API)
 */
async function fetchCoinGeckoTop(limit: number = 30): Promise<Omit<SymbolMapping, 'eligible' | 'excludeReason'>[]> {
  try {
    const res = await fetch(
      `https://api.coingecko.com/api/v3/coins/markets?vs_currency=usd&order=market_cap_desc&per_page=${limit}&page=1&sparkline=false`
    );

    if (!res.ok) {
      logger.warn(`[Universe] CoinGecko API error: ${res.status}`);
      return [];
    }

    const data = await res.json();
    return data.map((coin: any, index: number) => ({
      coinId: coin.id,
      symbol: coin.symbol.toUpperCase(),
      binanceSymbol: `${coin.symbol.toUpperCase()}USDT`,
      marketCapRank: index + 1,
    }));
  } catch (error) {
    logger.warn('[Universe] CoinGecko fetch failed', error);
    return [];
  }
}

/**
 * Map top coins to valid Binance USDT perpetual symbols
 */
export function mapToEligibleSymbols(
  coins: Omit<SymbolMapping, 'eligible' | 'excludeReason'>[],
  exchangeSymbols: Set<string>
): SymbolMapping[] {
  return coins.map(coin => {
    // Check exclusions
    if (EXCLUDED_ASSETS.has(coin.symbol)) {
      return {
        ...coin,
        eligible: false,
        excludeReason: 'Stablecoin - no perpetual contract needed',
      };
    }

    if (!coin.binanceSymbol) {
      return {
        ...coin,
        eligible: false,
        excludeReason: 'No Binance symbol mapping',
      };
    }

    let binanceSymbol = coin.binanceSymbol;
    if (!exchangeSymbols.has(binanceSymbol)) {
      // Check for Binance 1000x contract convention (e.g., 1000SHIBUSDT, 1000PEPEUSDT, 1000BONKUSDT)
      const prefixed = `1000${binanceSymbol}`;
      if (exchangeSymbols.has(prefixed)) {
        binanceSymbol = prefixed;
      } else {
        return {
          ...coin,
          eligible: false,
          excludeReason: `${coin.binanceSymbol} not found on Binance Futures`,
        };
      }
    }

    return {
      ...coin,
      binanceSymbol,
      eligible: true,
      excludeReason: null,
    };
  });
}

/**
 * Get the current symbol universe, fetching from CoinGecko if needed
 */
export async function getSymbolUniverse(
  exchangeSymbols: Set<string>,
  forceRefresh: boolean = false
): Promise<SymbolMapping[]> {
  // Check cache (last snapshot within 24 hours)
  if (!forceRefresh) {
    const recent = await prisma.symbolUniverse.findFirst({
      orderBy: { createdAt: 'desc' },
    });
    if (recent && Date.now() - recent.createdAt.getTime() < 24 * 60 * 60 * 1000) {
      const cached = JSON.parse(recent.symbolsJson) as SymbolMapping[];
      return cached;
    }
  }

  // Try CoinGecko
  const coins = await fetchCoinGeckoTop(50);
  if (coins.length === 0) {
    logger.warn('[Universe] Market-cap data is unavailable; refusing to substitute an unverified universe');
    return [];
  }

  const mapped = mapToEligibleSymbols(coins, exchangeSymbols);
  const eligible = mapped.filter(m => m.eligible).slice(0, 20);

  // Persist snapshot
  await prisma.symbolUniverse.create({
    data: {
      id: uuid(),
      symbolsJson: JSON.stringify(mapped),
      source: 'coingecko',
    },
  });

  logger.info(`[Universe] ${eligible.length} eligible symbols: ${eligible.map(s => s.binanceSymbol).join(', ')}`);
  return mapped;
}

/**
 * Get eligible Binance symbols from the universe
 */
export function getEligibleBinanceSymbols(universe: SymbolMapping[]): string[] {
  return universe
    .filter(m => m.eligible)
    .sort((a, b) => a.marketCapRank - b.marketCapRank)
    .slice(0, 20)
    .map(m => m.binanceSymbol);
}
