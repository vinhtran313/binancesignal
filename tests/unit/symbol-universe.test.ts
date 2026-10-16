/**
 * Tests for symbol universe mapping
 */
import { describe, it, expect } from 'vitest';
import { mapToEligibleSymbols } from '@/server/symbol-universe';

describe('Symbol Universe', () => {
  const exchangeSymbols = new Set([
    'BTCUSDT', 'ETHUSDT', 'BNBUSDT', 'SOLUSDT', 'XRPUSDT',
    'DOGEUSDT', 'ADAUSDT', 'TRXUSDT', 'AVAXUSDT', 'SHIBUSDT',
    'LINKUSDT', 'DOTUSDT', 'BCHUSDT', 'NEARUSDT', 'UNIUSDT',
    'LTCUSDT', 'MATICUSDT', 'ICPUSDT',
  ]);

  it('filters out stablecoins', () => {
    const coins = [
      { coinId: 'tether', symbol: 'USDT', binanceSymbol: 'USDTUSDT', marketCapRank: 3 },
      { coinId: 'usd-coin', symbol: 'USDC', binanceSymbol: 'USDCUSDT', marketCapRank: 7 },
      { coinId: 'bitcoin', symbol: 'BTC', binanceSymbol: 'BTCUSDT', marketCapRank: 1 },
    ];

    const mapped = mapToEligibleSymbols(coins, exchangeSymbols);
    const eligible = mapped.filter(m => m.eligible);
    const excluded = mapped.filter(m => !m.eligible);

    expect(eligible.length).toBe(1);
    expect(eligible[0].symbol).toBe('BTC');
    expect(excluded.length).toBe(2);
    expect(excluded.every(e => e.excludeReason?.includes('Stablecoin'))).toBe(true);
  });

  it('excludes symbols not on Binance', () => {
    const coins = [
      { coinId: 'bitcoin', symbol: 'BTC', binanceSymbol: 'BTCUSDT', marketCapRank: 1 },
      { coinId: 'fakecoin', symbol: 'FAKE', binanceSymbol: 'FAKEUSDT', marketCapRank: 10 },
    ];

    const mapped = mapToEligibleSymbols(coins, exchangeSymbols);
    expect(mapped[0].eligible).toBe(true);
    expect(mapped[1].eligible).toBe(false);
    expect(mapped[1].excludeReason).toContain('not found');
  });

  it('maps all top coins correctly', () => {
    const coins = [
      { coinId: 'bitcoin', symbol: 'BTC', binanceSymbol: 'BTCUSDT', marketCapRank: 1 },
      { coinId: 'ethereum', symbol: 'ETH', binanceSymbol: 'ETHUSDT', marketCapRank: 2 },
      { coinId: 'solana', symbol: 'SOL', binanceSymbol: 'SOLUSDT', marketCapRank: 5 },
    ];

    const mapped = mapToEligibleSymbols(coins, exchangeSymbols);
    expect(mapped.every(m => m.eligible)).toBe(true);
    expect(mapped.length).toBe(3);
  });
});
