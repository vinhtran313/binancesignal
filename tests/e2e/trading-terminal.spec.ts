import { test, expect, type Page } from '@playwright/test';

const now = Date.now();
const account = {
  id: 'account-1', initialBalance: 1000, balance: 1000, equity: 1000, availableBalance: 1000,
  usedMargin: 0, realizedPnl: 0, unrealizedPnl: 0, totalFees: 0, totalFunding: 0,
  openPositionsCount: 0, maxPositions: 10, snapshotChangePercent: null, updatedAt: now,
};
const config = { timeframe: '5m', riskPercent: 1, maxPositions: 10, leverage: 1, takerFee: 0.001, makerFee: 0.001, slippage: 0.0005, riskRewardRatio: 1.2, enabledSymbols: ['BTCUSDT', 'ETHUSDT'] };
const signal = {
  id: '11111111-1111-4111-8111-111111111111', strategyRunId: 'run-1', symbol: 'BTCUSDT', timeframe: '5m',
  action: 'ENTRY_LONG', result: 'CONFIRMED', rejectReason: null, entryPrice: 100, stopLoss: 95, takeProfit: 106,
  candleCloseTime: now + 240_000, candleOpenTime: now - 60_000, expiresAt: now + 240_000, confirmationTime: null,
  macdLine: -1.25, macdSignal: -1.3, macdHistogram: 0.05, prevHistogram: -0.02, createdAt: now - 1_000,
  strengthScore: 72, strengthLabel: 'MODERATE', scoreVersion: 'signal-strength-v1',
  strengthBreakdown: { emaAlignment: 20, macdMomentum: 18, waveContext: 14, rsi: 7, volume: 6, stopQuality: 7, rsiValue: 52, volumeRatio: 1.2, atr: 1, stopDistanceAtr: 1, waveComparison: 'MOMENTUM_IMPROVING', previousMacdExtreme: -1, priorMacdExtreme: -1.2, previousPriceExtreme: 98, priorPriceExtreme: 99 },
  tradeId: 'trade-1',
};
const notification = { id: '22222222-2222-4222-8222-222222222222', signalId: signal.id, readAt: null, dismissedAt: null, createdAt: now - 1_000, signal };
const candles = Array.from({ length: 80 }, (_, i) => {
  const close = 100 + Math.sin(i / 5) * 3 + i * 0.02;
  const openTime = now - (80 - i) * 300_000;
  return { openTime, open: close - 0.2, high: close + 0.5, low: close - 0.5, close, volume: 100 + i, closeTime: openTime + 299_999, quoteVolume: close * 100, trades: 100, isClosed: true };
});
const indicators = Object.fromEntries(['ema34', 'ema89', 'ema200', 'ema610', 'rsi14', 'macdLine', 'macdSignal', 'macdHistogram'].map(key => [key, candles.map((_, i) => key === 'rsi14' ? 50 + Math.sin(i) * 10 : key === 'macdHistogram' ? Math.sin(i / 4) * 0.1 : 100 + Math.sin(i / 5))]));

async function prepareTradingTerminal(page: Page) {
  await page.route('**/api/engine', route => route.fulfill({ json: { success: true, data: { account, strategy: { status: 'RUNNING', runId: 'run-1', startedAt: now, lastProcessedAt: now, symbolsMonitored: 2, lastSignal: null, rejectedCount: 0, totalSignals: 1, errorMessage: null }, connection: 'CONNECTED', symbols: ['BTCUSDT', 'ETHUSDT'], config }, timestamp: now } }));
  await page.route('**/api/symbols', route => route.fulfill({ json: { success: true, data: ['BTCUSDT', 'ETHUSDT'].map(symbol => ({ symbol, markPrice: 100, symbolInfo: null })), timestamp: now } }));
  await page.route('**/api/market?*', route => route.fulfill({ json: { success: true, data: { symbol: 'BTCUSDT', timeframe: '5m', candles, indicators, markPrice: 100, symbolInfo: null }, timestamp: now } }));
  const events = [
    { type: 'account', account },
    { type: 'strategy', state: { status: 'RUNNING', runId: 'run-1', startedAt: now, lastProcessedAt: now, symbolsMonitored: 2, lastSignal: null, rejectedCount: 0, totalSignals: 1, errorMessage: null } },
    { type: 'connection', status: 'CONNECTED' },
    { type: 'positions', positions: [] },
    { type: 'config', config },
    { type: 'symbols', symbols: ['BTCUSDT', 'ETHUSDT'] },
    { type: 'notifications', notifications: [notification] },
  ].map(event => `data: ${JSON.stringify(event)}\n\n`).join('');
  await page.route('**/api/stream', route => route.fulfill({ status: 200, headers: { 'content-type': 'text/event-stream', 'cache-control': 'no-cache' }, body: events }));
  await page.route('**/api/notifications', route => {
    if (route.request().method() === 'GET') return route.fulfill({ json: { success: true, data: [notification], timestamp: now } });
    return route.fulfill({ json: { success: true, position: { id: 'trade-1', takeProfit: 110 }, timestamp: now } });
  });
  await page.route('**/api/strategy', route => route.fulfill({ json: { success: true, data: { status: 'RUNNING' }, timestamp: now } }));
}

test.beforeEach(async ({ page }) => prepareTradingTerminal(page));

test('renders the trading terminal and all four synchronized chart panes', async ({ page }) => {
  await page.goto('/');
  await expect(page.getByText('FUTURES TERMINAL')).toBeVisible();
  await expect(page.getByText('PAPER', { exact: true })).toBeVisible();
  await expect(page.getByText('RSI 14 · 30 / 50 / 70')).toBeVisible();
  await expect(page.getByText('MACD 12 / 26 / 9')).toBeVisible();
  await expect(page.getByRole('button', { name: /Notifications, 1 unread/i })).toBeVisible();
  await expect.poll(() => page.locator('canvas').count()).toBeGreaterThanOrEqual(4);
  await page.getByRole('button', { name: 'Jump chart to live' }).click();
  await page.screenshot({ path: 'test-results/trading-terminal.png', fullPage: true });
});

test('shows the automatic paper entry and signal strength', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /Notifications/ }).click();
  await page.getByText('BTCUSDT · LONG · 5m').click();
  await expect(page.getByRole('dialog', { name: 'Automatic paper entry' })).toBeVisible();
  await expect(page.getByText('Paper position opened automatically at strength 72/100.')).toBeVisible();
  await expect(page.getByText('Signal strength', { exact: true })).toBeVisible();
  await expect(page.getByRole('button', { name: 'Open paper order' })).toHaveCount(0);
});

test('watchlist selection switches the chart symbol', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: /ETH USDT · Perpetual/ }).click();
  await expect(page.getByRole('button', { name: 'ETH /USDT' })).toBeVisible();
});

test('strategy panel opens and closes without closing positions', async ({ page }) => {
  await page.goto('/');
  await page.getByRole('button', { name: 'Strategy' }).click();
  await expect(page.getByText('Strategy Control')).toBeVisible();
  await expect(page.getByText(/SL monitoring continues/)).toBeVisible();
  await page.getByRole('button', { name: 'Close strategy settings' }).click();
  await expect(page.getByText('Strategy Control')).toHaveCount(0);
});

test('the terminal remains usable at a narrow viewport', async ({ page }) => {
  await page.setViewportSize({ width: 390, height: 844 });
  await page.goto('/');
  await expect(page.getByText('FUTURES TERMINAL')).toBeVisible();
  await expect(page.getByRole('button', { name: /Notifications/ })).toBeVisible();
});
