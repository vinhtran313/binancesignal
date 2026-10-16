/**
 * Trading Engine Worker
 * Orchestrates market data, strategy, execution, and accounting
 *
 * This is a long-lived server-side process that:
 * 1. Connects to Binance WebSocket for real-time data
 * 2. Maintains candle history for all monitored symbols
 * 3. Processes candle-close events through the strategy engine
 * 4. Executes paper trades and manages stop losses
 * 5. Handles funding events
 * 6. Creates account snapshots at 15-minute boundaries
 * 7. Broadcasts state updates to connected clients
 */

import { BinanceWebSocket } from './market-data/binance-ws';
import {
  fetchExchangeInfo,
  fetchHistoricalCandles,
  fetchMarkPrice,
  fetchFundingRate,
} from './market-data/binance-rest';
import { calculateAllIndicators } from './indicators';
import { checkMacdSignal, createSignalIdempotencyKey, buildSignalEvent } from './strategy-engine';
import { executeEntry, executeExit, checkStopLosses } from './execution-engine';
import {
  getAccountState,
  ensureAccount,
  createSnapshot,
  getCurrent15MinBoundary,
  processFunding,
  getPositionsWithPnl,
} from './accounting';
import { getSymbolUniverse, getEligibleBinanceSymbols } from './symbol-universe';
import { prisma } from './persistence/prisma';
import { logger } from './utils/logger';
import { sendTelegramSignalAlert } from './notifications/telegram';
import { v4 as uuid } from 'uuid';
import type {
  Candle,
  Timeframe,
  SymbolInfo,
  StrategyStatus,
  StrategyState,
  AccountState,
  Position,
  ConnectionStatus,
  Side,
  TradingConfig,
  IndicatorSeries,
  ExitReason,
} from '@/shared/types';
import { DEFAULT_TRADING_CONFIG, TIMEFRAMES } from '@/shared/types';

// Global state (singleton worker)
class TradingEngine {
  private ws: BinanceWebSocket;
  private candleHistory: Map<string, Map<Timeframe, Candle[]>> = new Map();
  private historyLoads: Map<string, Promise<Candle[]>> = new Map();
  private indicatorCache: Map<string, IndicatorSeries> = new Map();
  private markPrices: Map<string, number> = new Map();
  private lastPrices: Map<string, number> = new Map();
  private lastPriceTimes: Map<string, number> = new Map();
  private markPriceTimes: Map<string, number> = new Map();
  private fundingRates: Map<string, { rate: number; nextTime: number }> = new Map();
  private symbolInfoMap: Map<string, SymbolInfo> = new Map();
  private monitoredSymbols: string[] = [];
  private universeSymbols: string[] = [];
  private accountId: string = '';
  private strategyRunId: string | null = null;
  private strategyStatus: StrategyStatus = 'IDLE';
  private connectionStatus: ConnectionStatus = 'DISCONNECTED';
  private strategyTimeframe: Timeframe = '5m';
  private config: TradingConfig = { ...DEFAULT_TRADING_CONFIG };
  private processedCandles: Set<string> = new Set(); // Dedup
  private snapshotTimer: NodeJS.Timeout | null = null;
  private slCheckTimer: NodeJS.Timeout | null = null;
  private lastProcessedAt: number | null = null;
  private rejectedCount: number = 0;
  private totalSignals: number = 0;
  private errorMessage: string | null = null;
  private lastMarkPriceBroadcast: number = 0;
  private fundingTimer: NodeJS.Timeout | null = null;
  private initializationPromise: Promise<void> | null = null;
  private initialized = false;

  // State update handlers (SSE)
  private stateListeners: Set<(data: any) => void> = new Set();

  constructor() {
    this.ws = new BinanceWebSocket();
  }

  addStateListener(listener: (data: any) => void) {
    this.stateListeners.add(listener);
  }

  removeStateListener(listener: (data: any) => void) {
    this.stateListeners.delete(listener);
  }

  private broadcast(data: any) {
    for (const listener of this.stateListeners) {
      try {
        listener(data);
      } catch (e) {
        // Remove broken listeners
        this.stateListeners.delete(listener);
      }
    }
  }

  async initialize() {
    if (this.initialized) return;
    if (!this.initializationPromise) {
      this.initializationPromise = this.initializeOnce();
    }
    try {
      await this.initializationPromise;
      this.initialized = true;
    } catch (error) {
      this.initializationPromise = null;
      throw error;
    }
  }

  private async initializeOnce() {
    logger.info('[Engine] Initializing...');

    // Ensure account exists
    this.accountId = await ensureAccount(500);

    // Fetch exchange info
    const allSymbols = await fetchExchangeInfo();
    for (const info of allSymbols) {
      this.symbolInfoMap.set(info.symbol, info);
    }
    logger.info(`[Engine] Loaded ${allSymbols.length} symbol infos`);

    // Get symbol universe
    const exchangeSymbolSet = new Set(allSymbols.map(s => s.symbol));
    const universe = await getSymbolUniverse(exchangeSymbolSet);
    this.universeSymbols = getEligibleBinanceSymbols(universe);
    this.monitoredSymbols = [...this.universeSymbols];
    logger.info(`[Engine] Monitoring ${this.monitoredSymbols.length} symbols`);

    // Restore strategy state
    const activeRun = await prisma.strategyRun.findFirst({
      where: { accountId: this.accountId, status: { in: ['RUNNING', 'PAUSED'] } },
      orderBy: { createdAt: 'desc' },
    });

    if (activeRun) {
      this.strategyRunId = activeRun.id;
      this.strategyStatus = activeRun.status as StrategyStatus;
      this.strategyTimeframe = activeRun.timeframe as Timeframe;
      try {
        const config = JSON.parse(activeRun.configJson);
        this.config = { ...DEFAULT_TRADING_CONFIG, ...config };
      } catch (e) {
        // Use defaults
      }
      logger.info(`[Engine] Restored strategy run: ${activeRun.id} (${activeRun.status})`);
    }

    // Recover the small confirmation window if the server stopped between claiming a signal and writing its fill.
    const confirming = await prisma.signalEvent.findMany({ where: { result: 'CONFIRMING' } });
    for (const signal of confirming) {
      const position = await prisma.position.findUnique({ where: { idempotencyKey: `manual:${signal.id}` } });
      if (position) {
        await prisma.signalEvent.update({ where: { id: signal.id }, data: { result: 'CONFIRMED', takeProfit: position.takeProfit } });
      } else {
        await prisma.signalEvent.update({
          where: { id: signal.id },
          data: Date.now() >= signal.expiresAt.getTime() ? { result: 'EXPIRED' } : { result: 'ACTIONABLE', confirmationTime: null },
        });
      }
    }
    await prisma.signalEvent.updateMany({ where: { result: 'ACTIONABLE', expiresAt: { lte: new Date() } }, data: { result: 'EXPIRED' } });

    // Start snapshot timer
    this.startSnapshotTimer();

    // Start SL check timer
    this.startSLCheckTimer();

    // Start funding timer
    this.startFundingTimer();
    await this.loadHistoricalData();
    this.connectWebSocket();
  }

  async loadHistoricalData() {
    logger.info('[Engine] Loading historical candles...');

    for (const symbol of this.monitoredSymbols) {
      try {
        const candles = await this.ensureCandleHistory(symbol, this.strategyTimeframe);

        logger.info(`[Engine] Loaded ${candles.length} candles for ${symbol}`);
      } catch (error) {
        logger.error(`[Engine] Failed to load history for ${symbol}`, error);
      }
    }

    // Fetch initial mark prices
    try {
      const prices = await fetchMarkPrice();
      for (const p of prices) {
        if (this.monitoredSymbols.includes(p.symbol)) {
          this.markPrices.set(p.symbol, p.markPrice);
          this.markPriceTimes.set(p.symbol, Date.now());
          this.fundingRates.set(p.symbol, {
            rate: p.lastFundingRate,
            nextTime: p.nextFundingTime,
          });
        }
      }
    } catch (error) {
      logger.error('[Engine] Failed to fetch mark prices', error);
    }
  }

  connectWebSocket() {
    this.ws.setCandleHandler((symbol, timeframe, candle) => {
      this.handleCandle(symbol, timeframe, candle);
    });

    this.ws.setMarkPriceHandler((symbol, markPrice, fundingRate, nextFundingTime) => {
      this.handleMarkPrice(symbol, markPrice, fundingRate, nextFundingTime);
    });

    this.ws.setConnectionStatusHandler((status) => {
      this.connectionStatus = status as ConnectionStatus;
      this.broadcast({ type: 'connection', status: this.connectionStatus });
    });

    this.ws.subscribe(this.monitoredSymbols, TIMEFRAMES);
  }

  private handleCandle(symbol: string, timeframe: Timeframe, candle: Candle) {
    // Update candle history
    if (!this.candleHistory.has(symbol)) {
      this.candleHistory.set(symbol, new Map());
    }
    const tfHistory = this.candleHistory.get(symbol)!;
    if (!tfHistory.has(timeframe)) {
      tfHistory.set(timeframe, []);
    }
    const candles = tfHistory.get(timeframe)!;

    // Update or append candle
    const lastCandle = candles[candles.length - 1];
    if (lastCandle && lastCandle.openTime === candle.openTime) {
      candles[candles.length - 1] = candle;
    } else if (!lastCandle || candle.openTime > lastCandle.openTime) {
      candles.push(candle);
      // Keep history bounded
      if (candles.length > 1000) {
        candles.splice(0, candles.length - 1000);
      }
    }

    // Broadcast candle update
    this.broadcast({ type: 'candle', symbol, timeframe, candle });
    if (timeframe === this.strategyTimeframe) {
      this.lastPrices.set(symbol, candle.close);
      this.lastPriceTimes.set(symbol, Date.now());
    }

    // Update indicator cache
    if (candle.isClosed) {
      const indicators = calculateAllIndicators(candles);
      this.indicatorCache.set(`${symbol}:${timeframe}`, indicators);
    }

    if (timeframe === this.strategyTimeframe) {
      void this.processSignalUpdate(symbol, timeframe, candle);
    }
  }

  private handleMarkPrice(
    symbol: string,
    markPrice: number,
    fundingRate: number,
    nextFundingTime: number
  ) {
    this.markPrices.set(symbol, markPrice);
    this.markPriceTimes.set(symbol, Date.now());
    this.fundingRates.set(symbol, { rate: fundingRate, nextTime: nextFundingTime });

    // Throttle mark price broadcasts to at most once per second
    const now = Date.now();
    if (now - this.lastMarkPriceBroadcast > 1000) {
      this.lastMarkPriceBroadcast = now;
      for (const [sym, price] of this.markPrices.entries()) {
        this.broadcast({ type: 'markPrice', symbol: sym, markPrice: price });
      }
    }
  }

  private async processSignalUpdate(symbol: string, timeframe: Timeframe, candle: Candle) {
    if (!this.strategyRunId) return;
    const candleKey = `${symbol}:${timeframe}:${candle.openTime}`;
    try {
      if (candle.isClosed) {
        const expired = await prisma.signalEvent.updateMany({
          where: { strategyRunId: this.strategyRunId, symbol, timeframe, candleOpenTime: new Date(candle.openTime), result: 'ACTIONABLE' },
          data: { result: 'EXPIRED' },
        });
        if (expired.count) this.broadcast({ type: 'notifications:refresh' });
        return;
      }
      if (this.strategyStatus !== 'RUNNING' || this.connectionStatus !== 'CONNECTED') return;
      const sourceTimes = this.config.triggerPriceModel === 'LAST_PRICE' ? this.lastPriceTimes : this.markPriceTimes;
      if (!sourceTimes.has(symbol) || Date.now() - sourceTimes.get(symbol)! > 10_000) return;
      if (this.processedCandles.has(candleKey)) return;

      const candles = this.candleHistory.get(symbol)?.get(timeframe);
      if (!candles || candles.length < 36) return;
      const signal = checkMacdSignal(candles, 12, 26, 9);
      if (!signal.hasSignal || !signal.action || !this.strategyRunId) return;

      const key = createSignalIdempotencyKey(this.strategyRunId, symbol, timeframe, candle.openTime);
      const signalEvent = buildSignalEvent(signal, this.strategyRunId, symbol, timeframe, candle.closeTime, candle.openTime, candle.closeTime);
      const created = await prisma.$transaction(async tx => {
        const event = await tx.signalEvent.create({
          data: {
            ...signalEvent,
            candleCloseTime: new Date(candle.closeTime),
            candleOpenTime: new Date(candle.openTime),
            expiresAt: new Date(candle.closeTime + 1),
            confirmationTime: null,
            idempotencyKey: key,
          },
        });
        await tx.notification.create({ data: { signalId: event.id } });
        return { event };
      });
      this.processedCandles.add(candleKey);
      this.totalSignals++;
      this.lastProcessedAt = Date.now();
      if (created.event.result === 'ACTIONABLE') {
        void sendTelegramSignalAlert({
          symbol,
          timeframe,
          action: signal.action,
          entryPrice: created.event.entryPrice,
          stopLoss: created.event.stopLoss,
          macdLine: created.event.macdLine,
          macdSignal: created.event.macdSignal,
          macdHistogram: created.event.macdHistogram,
          prevHistogram: created.event.prevHistogram,
          expiresAt: created.event.expiresAt.getTime(),
        });
      }
      // The SSE route reloads the canonical serialized list for every new signal.
      this.broadcast({ type: 'notifications:refresh' });
      this.broadcastStrategyState();
      logger.info(`[Signal] ${signal.side} ${symbol} intrabar notification ${created.event.id}`);
    } catch (error) {
      if ((error as { code?: string })?.code === 'P2002') {
        this.processedCandles.add(candleKey);
        return;
      }
      logger.error(`[Signal] Error evaluating ${symbol}`, error);
    }
  }

  private startSnapshotTimer() {
    const checkSnapshot = async () => {
      const now = new Date();
      const boundary = getCurrent15MinBoundary(now);
      const timeSinceBoundary = now.getTime() - boundary.getTime();

      // Create snapshot within 5 seconds of boundary
      if (timeSinceBoundary < 5000) {
        await createSnapshot(this.accountId, this.markPrices, boundary);
        this.broadcastAccountState();
      }
    };

    this.snapshotTimer = setInterval(checkSnapshot, 5000);
  }

  private startSLCheckTimer() {
    const checkSL = async () => {
      if (this.markPrices.size === 0) return;

      const triggerPrices = this.config.triggerPriceModel === 'LAST_PRICE' ? this.lastPrices : this.markPrices;
      if (triggerPrices.size === 0) return;
      const results = await checkStopLosses(
        triggerPrices,
        this.symbolInfoMap,
        this.config.takerFee,
        this.config.slippage,
        symbol => this.getExitEmaSnapshot(symbol)
      );

      if (results.length > 0) {
        this.broadcastAccountState();
        this.broadcastPositions();
      }
    };

    this.slCheckTimer = setInterval(checkSL, 1000); // Check every second
  }

  /** Poll Binance's settled funding history; never apply a current estimate to a past boundary. */
  private startFundingTimer() {
    const checkFunding = async () => {
      const openPositions = await prisma.position.findMany({
        where: { accountId: this.accountId, status: 'OPEN' },
      });
      if (openPositions.length === 0) return;
      const now = Date.now();
      let anyProcessed = false;
      const symbols = Array.from(new Set(openPositions.map(position => position.symbol)));
      for (const symbol of symbols) {
        try {
          const settledRates = await fetchFundingRate(symbol, 1000);
          const symbolPositions = openPositions.filter(position => position.symbol === symbol);
          for (const rate of settledRates) {
            if (rate.fundingTime > now || !(rate.markPrice > 0)) continue;
            for (const position of symbolPositions) {
              if (rate.fundingTime <= position.entryTime.getTime()) continue;
              const eventKey = `funding:${position.id}:${rate.fundingTime}`;
              const alreadyProcessed = await prisma.fundingEvent.findUnique({ where: { idempotencyKey: eventKey }, select: { id: true } });
              if (alreadyProcessed) continue;
              await processFunding(this.accountId, position.id, symbol, rate.fundingRate, rate.markPrice, new Date(rate.fundingTime), position.quantity, position.side as Side);
              anyProcessed = true;
            }
          }
        } catch (error) {
          logger.error(`[Funding] Failed to reconcile settled rates for ${symbol}`, error);
        }
      }
      if (anyProcessed) {
        this.broadcastAccountState();
        this.broadcastPositions();
      }
    };

    this.fundingTimer = setInterval(checkFunding, 30_000); // Check every 30 seconds
  }

  // Strategy controls
  async startStrategy(timeframe: Timeframe = '5m', config?: Partial<TradingConfig>) {
    if (this.strategyStatus === 'RUNNING') {
      throw new Error('Strategy is already running');
    }

    if (config) {
      this.config = { ...this.config, ...config };
      this.monitoredSymbols = config.enabledSymbols?.length
        ? this.universeSymbols.filter(symbol => config.enabledSymbols!.includes(symbol))
        : [...this.universeSymbols];
    }
    this.strategyTimeframe = timeframe;
    this.config.timeframe = timeframe;

    // Create new strategy run
    const run = await prisma.strategyRun.create({
      data: {
        id: uuid(),
        accountId: this.accountId,
        name: 'MACD Histogram Reversal',
        timeframe,
        status: 'RUNNING',
        configJson: JSON.stringify(this.config),
        startedAt: new Date(),
      },
    });

    this.strategyRunId = run.id;
    this.strategyStatus = 'RUNNING';
    this.rejectedCount = 0;
    this.totalSignals = 0;
    this.errorMessage = null;

    // Reload historical data if timeframe changed
    await this.loadHistoricalData();

    // Reconnect WebSocket with new timeframe
    this.ws.updateSubscriptions(this.monitoredSymbols, TIMEFRAMES);

    logger.info(`[Engine] Strategy started: ${run.id} (${timeframe})`);
    this.broadcastStrategyState();
  }

  async pauseStrategy() {
    if (this.strategyStatus !== 'RUNNING') {
      throw new Error('Strategy is not running');
    }

    this.strategyStatus = 'PAUSED';
    if (this.strategyRunId) {
      await prisma.strategyRun.update({
        where: { id: this.strategyRunId },
        data: { status: 'PAUSED' },
      });
    }

    logger.info('[Engine] Strategy paused (open positions maintained)');
    this.broadcastStrategyState();
  }

  async resumeStrategy() {
    if (this.strategyStatus !== 'PAUSED') {
      throw new Error('Strategy is not paused');
    }

    this.strategyStatus = 'RUNNING';
    if (this.strategyRunId) {
      await prisma.strategyRun.update({
        where: { id: this.strategyRunId },
        data: { status: 'RUNNING' },
      });
    }

    logger.info('[Engine] Strategy resumed');
    this.broadcastStrategyState();
  }

  async stopStrategy() {
    if (this.strategyStatus === 'IDLE' || this.strategyStatus === 'STOPPED') {
      throw new Error('Strategy is not active');
    }

    this.strategyStatus = 'STOPPED';
    if (this.strategyRunId) {
      await prisma.strategyRun.update({
        where: { id: this.strategyRunId },
        data: { status: 'STOPPED', stoppedAt: new Date() },
      });
    }

    // Note: does NOT close existing positions
    logger.info('[Engine] Strategy stopped (open positions maintained)');
    this.broadcastStrategyState();
  }

  async closePosition(positionId: string, reason: ExitReason = 'MANUAL') {
    const position = await prisma.position.findUnique({
      where: { id: positionId },
    });

    if (!position || position.status !== 'OPEN') {
      throw new Error('Position not found or already closed');
    }

    const currentPrice = this.markPrices.get(position.symbol) || position.entryPrice;
    const symbolInfo = this.symbolInfoMap.get(position.symbol);

    const result = await executeExit(
      positionId,
      currentPrice,
      reason,
      symbolInfo,
      this.config.takerFee,
      this.config.slippage,
      this.getExitEmaSnapshot(position.symbol)
    );

    if (result.success) {
      this.broadcastAccountState();
      this.broadcastPositions();
    }

    return result;
  }

  // State getters
  async getAccountState(): Promise<AccountState | null> {
    return getAccountState(this.accountId, this.markPrices, this.config.maxPositions);
  }

  async getPositions(): Promise<Position[]> {
    return getPositionsWithPnl(this.accountId, this.markPrices);
  }

  async getNotifications() {
    const rows = await prisma.notification.findMany({
      where: { dismissedAt: null },
      include: { signal: { include: { position: true } } },
      orderBy: { createdAt: 'desc' },
      take: 100,
    });
    return rows.map(row => ({
      id: row.id,
      signalId: row.signalId,
      readAt: row.readAt?.getTime() ?? null,
      dismissedAt: row.dismissedAt?.getTime() ?? null,
      createdAt: row.createdAt.getTime(),
      signal: {
        ...row.signal,
        candleCloseTime: row.signal.candleCloseTime.getTime(),
        candleOpenTime: row.signal.candleOpenTime.getTime(),
        expiresAt: row.signal.expiresAt.getTime(),
        confirmationTime: row.signal.confirmationTime?.getTime() ?? null,
        createdAt: row.signal.createdAt.getTime(),
        tradeId: row.signal.position?.id ?? null,
      },
    }));
  }

  async confirmSignal(signalId: string) {
    let signal = await prisma.signalEvent.findUnique({ where: { id: signalId }, include: { position: true } });
    if (!signal) return { success: false, rejectReason: 'Signal not found', position: null };
    if (
      signal.result === 'REJECTED'
      && signal.rejectReason?.startsWith('Insufficient balance')
      && Date.now() < signal.expiresAt.getTime()
      && !signal.position
    ) {
      const reopened = await prisma.signalEvent.updateMany({
        where: { id: signalId, result: 'REJECTED', expiresAt: { gt: new Date() }, rejectReason: { startsWith: 'Insufficient balance' } },
        data: { result: 'ACTIONABLE', rejectReason: null },
      });
      if (reopened.count) {
        signal = await prisma.signalEvent.findUnique({ where: { id: signalId }, include: { position: true } });
        if (!signal) return { success: false, rejectReason: 'Signal not found', position: null };
      }
    }
    if (signal.result === 'CONFIRMED' && signal.position) {
      return { success: true, rejectReason: null, position: signal.position };
    }
    if (signal.result !== 'ACTIONABLE') return { success: false, rejectReason: `Signal is ${signal.result.toLowerCase()}`, position: null };
    if (Date.now() >= signal.expiresAt.getTime()) {
      await prisma.signalEvent.update({ where: { id: signalId }, data: { result: 'EXPIRED' } });
      this.broadcast({ type: 'notifications:refresh' });
      return { success: false, rejectReason: 'Signal has expired', position: null };
    }
    const priceTimes = this.config.triggerPriceModel === 'LAST_PRICE' ? this.lastPriceTimes : this.markPriceTimes;
    const priceTime = priceTimes.get(signal.symbol);
    if (!priceTime || Date.now() - priceTime > 10_000) return this.rejectSignal(signalId, 'Market data is stale');
    if (!this.monitoredSymbols.includes(signal.symbol)) return this.rejectSignal(signalId, 'Symbol is no longer eligible');
    if (!signal.stopLoss || !signal.entryPrice) return this.rejectSignal(signalId, 'Signal has no valid Stop Loss or reference price');
    const side: Side = signal.action === 'ENTRY_LONG' ? 'LONG' : 'SHORT';
    const referencePrice = (this.config.triggerPriceModel === 'LAST_PRICE' ? this.lastPrices : this.markPrices).get(signal.symbol);
    if (!referencePrice || !Number.isFinite(referencePrice)) return this.rejectSignal(signalId, 'Selected trigger-price reference is unavailable');
    const symbolInfo = this.symbolInfoMap.get(signal.symbol);
    if (!symbolInfo) return this.rejectSignal(signalId, 'Exchange filters are unavailable');

    const claimed = await prisma.signalEvent.updateMany({
      where: { id: signalId, result: 'ACTIONABLE', expiresAt: { gt: new Date() } },
      data: { result: 'CONFIRMING', confirmationTime: new Date() },
    });
    if (!claimed.count) return { success: false, rejectReason: 'Signal is no longer actionable', position: null };

    const indicators = this.indicatorCache.get(`${signal.symbol}:${signal.timeframe}`);
    const hist = indicators?.macdHistogram ?? [];
    const waveType = side === 'LONG' ? 'POSITIVE' : 'NEGATIVE';
    let previousWave: Record<string, unknown> = { status: 'UNAVAILABLE', reason: 'No completed same-direction MACD wave is available' };
    const waves = (await import('./strategy-engine/wave-detection')).detectMacdWaves(hist, this.getCandleHistory(signal.symbol, signal.timeframe as Timeframe), indicators?.macdLine ?? []);
    const wave = [...waves].reverse().find(item => item.type === waveType && item.endTime < signal.candleOpenTime.getTime());
    if (wave) previousWave = { ...wave, status: 'VALID' };

    const result = await executeEntry(
      this.accountId, signal.symbol, side, referencePrice, signal.stopLoss, symbolInfo,
      this.config, signal.strategyRunId, signal.id, `manual:${signal.id}`, this.config.riskRewardRatio,
      { timeframe: signal.timeframe, signal: { id: signal.id, detectionTime: signal.createdAt.toISOString(), referencePrice: signal.entryPrice, macdLine: signal.macdLine, signalLine: signal.macdSignal, histogram: signal.macdHistogram, previousHistogram: signal.prevHistogram }, previousWave }
    );
    if (!result.success || !result.position) {
      const canRetryAfterBalanceChange = result.rejectReason?.startsWith('Insufficient balance') ?? false;
      await prisma.signalEvent.update({
        where: { id: signalId },
        data: { result: canRetryAfterBalanceChange ? 'ACTIONABLE' : 'REJECTED', rejectReason: result.rejectReason },
      });
      if (!canRetryAfterBalanceChange) {
        await prisma.notification.updateMany({ where: { signalId }, data: { readAt: new Date() } });
      }
      this.broadcast({ type: 'notifications:refresh' });
      return result;
    }

    await prisma.signalEvent.update({ where: { id: signalId }, data: { result: 'CONFIRMED', rejectReason: null, takeProfit: result.position.takeProfit } });
    await prisma.notification.updateMany({ where: { signalId }, data: { readAt: new Date() } });
    this.broadcast({ type: 'notifications:refresh' });
    this.broadcastAccountState();
    this.broadcastPositions();
    return result;
  }

  async updateNotification(notificationId: string, action: 'read' | 'dismiss') {
    const now = new Date();
    await prisma.$transaction(async tx => {
      const notification = await tx.notification.findUnique({ where: { id: notificationId } });
      if (!notification) throw new Error('Notification not found');
      await tx.notification.update({ where: { id: notificationId }, data: action === 'read' ? { readAt: now } : { dismissedAt: now, readAt: now } });
      if (action === 'dismiss') {
        await tx.signalEvent.updateMany({ where: { id: notification.signalId, result: 'ACTIONABLE' }, data: { result: 'DISMISSED' } });
      }
    });
    this.broadcast({ type: 'notifications:refresh' });
    return { success: true };
  }

  async markAllNotificationsRead() {
    await prisma.notification.updateMany({ where: { readAt: null }, data: { readAt: new Date() } });
    this.broadcast({ type: 'notifications:refresh' });
    return { success: true };
  }

  private async rejectSignal(signalId: string, reason: string) {
    await prisma.signalEvent.updateMany({ where: { id: signalId, result: 'ACTIONABLE' }, data: { result: 'REJECTED', rejectReason: reason } });
    this.broadcast({ type: 'notifications:refresh' });
    return { success: false, rejectReason: reason, position: null };
  }

  private getExitEmaSnapshot(symbol: string) {
    const history = this.candleHistory.get(symbol)?.get(this.strategyTimeframe) ?? [];
    let candleIndex = -1;
    for (let index = history.length - 1; index >= 0; index--) {
      if (history[index].isClosed) { candleIndex = index; break; }
    }
    if (candleIndex < 0) return undefined;
    const indicators = this.indicatorCache.get(`${symbol}:${this.strategyTimeframe}`);
    if (!indicators) return undefined;
    const valueAt = (values: (number | null)[]) => values[candleIndex] ?? null;
    const values = {
      ema34: valueAt(indicators.ema34),
      ema89: valueAt(indicators.ema89),
      ema200: valueAt(indicators.ema200),
      ema610: valueAt(indicators.ema610),
    };
    return {
      timeframe: this.strategyTimeframe,
      timestamp: history[candleIndex].closeTime,
      values,
      unavailableReason: Object.values(values).some(value => value === null) ? 'One or more EMA values were unavailable during warm-up' : undefined,
    };
  }

  getStrategyState(): StrategyState {
    return {
      status: this.strategyStatus,
      runId: this.strategyRunId,
      startedAt: null, // TODO: track
      lastProcessedAt: this.lastProcessedAt,
      symbolsMonitored: this.monitoredSymbols.length,
      lastSignal: null,
      rejectedCount: this.rejectedCount,
      totalSignals: this.totalSignals,
      errorMessage: this.errorMessage,
    };
  }

  getConnectionStatus(): ConnectionStatus {
    return this.connectionStatus;
  }

  getMarkPrices(): Map<string, number> {
    return this.markPrices;
  }

  getMonitoredSymbols(): string[] {
    return this.monitoredSymbols;
  }

  getCandleHistory(symbol: string, timeframe: Timeframe): Candle[] {
    return this.candleHistory.get(symbol)?.get(timeframe) || [];
  }

  async ensureCandleHistory(symbol: string, timeframe: Timeframe): Promise<Candle[]> {
    const existing = this.getCandleHistory(symbol, timeframe);
    if (existing.length >= 100) return existing;
    if (!this.symbolInfoMap.has(symbol)) throw new Error(`Unknown or ineligible Binance symbol: ${symbol}`);

    const key = `${symbol}:${timeframe}`;
    const pending = this.historyLoads.get(key);
    if (pending) return pending;
    const load = fetchHistoricalCandles(symbol, timeframe, 750).then(candles => {
      if (!this.candleHistory.has(symbol)) this.candleHistory.set(symbol, new Map());
      const current = this.getCandleHistory(symbol, timeframe);
      const byTime = new Map<number, Candle>();
      for (const candle of candles) byTime.set(candle.openTime, candle);
      for (const candle of current) byTime.set(candle.openTime, candle);
      const merged = [...byTime.values()].sort((a, b) => a.openTime - b.openTime).slice(-1000);
      this.candleHistory.get(symbol)!.set(timeframe, merged);
      this.indicatorCache.set(`${symbol}:${timeframe}`, calculateAllIndicators(merged));
      return merged;
    }).finally(() => this.historyLoads.delete(key));
    this.historyLoads.set(key, load);
    return load;
  }

  getIndicators(symbol: string, timeframe: Timeframe): IndicatorSeries | null {
    return this.indicatorCache.get(`${symbol}:${timeframe}`) || null;
  }

  getSymbolInfo(symbol: string): SymbolInfo | undefined {
    return this.symbolInfoMap.get(symbol);
  }

  getConfig(): TradingConfig {
    return { ...this.config };
  }

  private async broadcastAccountState() {
    const state = await this.getAccountState();
    if (state) {
      this.broadcast({ type: 'account', account: state });
    }
  }

  private async broadcastPositions() {
    const positions = await this.getPositions();
    this.broadcast({ type: 'positions', positions });
  }

  private broadcastStrategyState() {
    this.broadcast({ type: 'strategy', state: this.getStrategyState() });
    this.broadcast({ type: 'config', config: this.getConfig() });
    this.broadcast({ type: 'symbols', symbols: this.getMonitoredSymbols() });
  }

  async shutdown() {
    logger.info('[Engine] Shutting down...');
    this.ws.disconnect();
    if (this.snapshotTimer) clearInterval(this.snapshotTimer);
    if (this.slCheckTimer) clearInterval(this.slCheckTimer);
    if (this.fundingTimer) clearInterval(this.fundingTimer);
    await prisma.$disconnect();
    logger.info('[Engine] Shutdown complete');
  }
}

// Singleton
export function getEngine(): TradingEngine {
  const globalEngine = globalThis as typeof globalThis & { __futuresTradingEngine?: TradingEngine };
  if (!globalEngine.__futuresTradingEngine) globalEngine.__futuresTradingEngine = new TradingEngine();
  return globalEngine.__futuresTradingEngine;
}

export async function initializeEngine(): Promise<TradingEngine> {
  const engine = getEngine();
  await engine.initialize();
  return engine;
}

export type { TradingEngine };
