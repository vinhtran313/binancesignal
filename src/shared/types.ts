// ============================================================
// Core Domain Types for Futures Trading Terminal
// ============================================================

// ---- Enums ----

export type Side = 'LONG' | 'SHORT';
export type PositionStatus = 'OPEN' | 'CLOSED';
export type OrderType = 'MARKET' | 'STOP_MARKET';
export type OrderSide = 'BUY' | 'SELL';
export type ExitReason = 'STOP_LOSS' | 'TAKE_PROFIT' | 'MANUAL' | 'LIQUIDATION' | 'STRATEGY_CLOSE';
export type StrategyStatus = 'IDLE' | 'RUNNING' | 'PAUSED' | 'STOPPED' | 'ERROR';
export type ConnectionStatus = 'CONNECTED' | 'CONNECTING' | 'DISCONNECTED' | 'RECONNECTING' | 'ERROR';
export type SignalAction = 'ENTRY_LONG' | 'ENTRY_SHORT' | 'EXIT_LONG' | 'EXIT_SHORT';
export type SignalResult = 'ACTIONABLE' | 'CONFIRMED' | 'EXPIRED' | 'DISMISSED' | 'REJECTED' | 'PENDING' | 'EXECUTED';

// ---- Timeframes ----

export const TIMEFRAMES = ['1m', '3m', '5m', '15m', '30m', '1h', '4h', '1d'] as const;
export type Timeframe = typeof TIMEFRAMES[number];

export const TIMEFRAME_MS: Record<Timeframe, number> = {
  '1m': 60_000,
  '3m': 180_000,
  '5m': 300_000,
  '15m': 900_000,
  '30m': 1_800_000,
  '1h': 3_600_000,
  '4h': 14_400_000,
  '1d': 86_400_000,
};

// ---- Market Data ----

export interface Candle {
  openTime: number;
  open: number;
  high: number;
  low: number;
  close: number;
  volume: number;
  closeTime: number;
  quoteVolume: number;
  trades: number;
  isClosed: boolean;
}

export interface MarkPrice {
  symbol: string;
  markPrice: number;
  indexPrice: number;
  lastFundingRate: number;
  nextFundingTime: number;
  timestamp: number;
}

export interface SymbolInfo {
  symbol: string;
  baseAsset: string;
  quoteAsset: string;
  pricePrecision: number;
  quantityPrecision: number;
  tickSize: number;
  stepSize: number;
  minQty: number;
  maxQty: number;
  minNotional: number;
  status: string;
}

export interface FundingRate {
  symbol: string;
  fundingRate: number;
  fundingTime: number;
  markPrice: number;
}

// ---- Account ----

export interface AccountState {
  id: string;
  initialBalance: number;
  balance: number;
  equity: number;
  availableBalance: number;
  usedMargin: number;
  realizedPnl: number;
  unrealizedPnl: number;
  totalFees: number;
  totalFunding: number;
  openPositionsCount: number;
  maxPositions: number;
  snapshotChangePercent: number | null;
  updatedAt: number;
}

export interface AccountSnapshot {
  id: string;
  accountId: string;
  balance: number;
  equity: number;
  unrealizedPnl: number;
  realizedPnl: number;
  totalFees: number;
  totalFunding: number;
  openPositionsCount: number;
  snapshotTime: number;
  createdAt: number;
}

// ---- Position / Trade ----

export interface Position {
  id: string;
  symbol: string;
  side: Side;
  status: PositionStatus;
  entryPrice: number;
  exitPrice: number | null;
  quantity: number;
  leverage: number;
  margin: number;
  stopLoss: number;
  takeProfit: number;
  riskRewardRatio: number;
  initialRiskBudget: number;
  entryTime: number;
  exitTime: number | null;
  entryNotional: number;
  exitNotional: number | null;
  unrealizedPnl: number;
  realizedGrossPnl: number | null;
  entryFee: number;
  exitFee: number | null;
  totalFees: number;
  fundingPaid: number;
  netPnl: number | null;
  pnlPercent: number | null;
  exitReason: ExitReason | null;
  strategyRunId: string | null;
  signalId: string | null;
  createdAt: number;
  updatedAt: number;
  analytics?: TradeAnalyticsView | null;
}

export interface TradeAnalyticsView {
  strategyVersion: string;
  timeframe: string;
  signalSnapshot: unknown;
  entrySnapshot: unknown;
  previousWave: unknown;
  exitSnapshot: unknown;
}

// ---- Strategy ----

export interface StrategyConfig {
  id: string;
  name: string;
  timeframe: Timeframe;
  riskPercent: number;
  maxPositions: number;
  leverage: number;
  takerFee: number;
  makerFee: number;
  slippage: number;
  enabledSymbols: string[];
  macdFast: number;
  macdSlow: number;
  macdSignal: number;
}

export interface StrategyState {
  status: StrategyStatus;
  runId: string | null;
  startedAt: number | null;
  lastProcessedAt: number | null;
  symbolsMonitored: number;
  lastSignal: SignalEvent | null;
  rejectedCount: number;
  totalSignals: number;
  errorMessage: string | null;
}

export interface SignalEvent {
  id: string;
  strategyRunId: string;
  symbol: string;
  timeframe: Timeframe;
  action: SignalAction;
  result: SignalResult;
  rejectReason: string | null;
  entryPrice: number | null;
  stopLoss: number | null;
  candleCloseTime: number;
  candleOpenTime: number;
  expiresAt: number;
  confirmationTime: number | null;
  takeProfit: number | null;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  prevHistogram: number;
  strengthScore: number;
  strengthLabel: SignalStrengthLabel;
  strengthBreakdown: SignalStrengthBreakdown;
  scoreVersion: string;
  createdAt: number;
}

export type SignalStrengthLabel = 'STRONG' | 'MODERATE' | 'WEAK' | 'UNSCORED';

export interface SignalStrengthBreakdown {
  emaAlignment: number;
  macdMomentum: number;
  waveContext: number;
  rsi: number;
  volume: number;
  stopQuality: number;
  rsiValue: number | null;
  volumeRatio: number | null;
  atr: number | null;
  stopDistanceAtr: number | null;
  waveComparison: 'BULLISH_DIVERGENCE' | 'BEARISH_DIVERGENCE' | 'MOMENTUM_IMPROVING' | 'NONE' | 'UNAVAILABLE';
  previousMacdExtreme: number | null;
  priorMacdExtreme: number | null;
  previousPriceExtreme: number | null;
  priorPriceExtreme: number | null;
}

export interface SignalStrengthAssessment {
  score: number;
  label: Exclude<SignalStrengthLabel, 'UNSCORED'>;
  version: string;
  breakdown: SignalStrengthBreakdown;
}

export const SIGNAL_STRENGTH_AUTO_ENTRY_THRESHOLD = 50;
export const MAX_OPEN_POSITIONS = 10;

export interface NotificationRecord {
  id: string;
  signalId: string;
  readAt: number | null;
  dismissedAt: number | null;
  createdAt: number;
  signal: SignalEvent & { tradeId: string | null };
}

// ---- Indicator Values ----

export interface IndicatorValues {
  ema34: number | null;
  ema89: number | null;
  ema200: number | null;
  ema610: number | null;
  rsi14: number | null;
  macdLine: number | null;
  macdSignal: number | null;
  macdHistogram: number | null;
}

export interface IndicatorSeries {
  ema34: (number | null)[];
  ema89: (number | null)[];
  ema200: (number | null)[];
  ema610: (number | null)[];
  rsi14: (number | null)[];
  macdLine: (number | null)[];
  macdSignal: (number | null)[];
  macdHistogram: (number | null)[];
}

// ---- MACD Wave ----

export interface MacdWave {
  type: 'POSITIVE' | 'NEGATIVE';
  startIndex: number;
  endIndex: number;
  highestPrice: number;
  lowestPrice: number;
  startTime: number;
  endTime: number;
  maxMacdLine: number | null;
  maxMacdTime: number | null;
  minMacdLine: number | null;
  minMacdTime: number | null;
  maxHistogram: number | null;
  maxHistogramTime: number | null;
  minHistogram: number | null;
  minHistogramTime: number | null;
  highestPriceTime: number | null;
  lowestPriceTime: number | null;
}

// ---- Symbol Universe ----

export interface SymbolMapping {
  coinId: string;
  symbol: string;
  binanceSymbol: string;
  sortOrder: number;
  eligible: boolean;
  excludeReason: string | null;
}

export interface UniverseSnapshot {
  id: string;
  symbols: SymbolMapping[];
  timestamp: number;
  source: string;
}

// ---- WebSocket Messages ----

export interface WsMarketUpdate {
  type: 'candle';
  symbol: string;
  timeframe: Timeframe;
  candle: Candle;
}

export interface WsAccountUpdate {
  type: 'account';
  account: AccountState;
}

export interface WsPositionUpdate {
  type: 'position';
  position: Position;
}

export interface WsStrategyUpdate {
  type: 'strategy';
  state: StrategyState;
}

export interface WsConnectionUpdate {
  type: 'connection';
  status: ConnectionStatus;
  details?: string;
}

export type WsMessage =
  | WsMarketUpdate
  | WsAccountUpdate
  | WsPositionUpdate
  | WsStrategyUpdate
  | WsConnectionUpdate;

// ---- API Response ----

export interface ApiResponse<T> {
  success: boolean;
  data?: T;
  error?: string;
  timestamp: number;
}

// ---- Configuration ----

export interface TradingConfig {
  timeframe?: Timeframe;
  leverage: number;
  riskPercent: number;
  maxPositions: number;
  takerFee: number;
  makerFee: number;
  slippage: number;
  riskRewardRatio?: number;
  enabledSymbols?: string[];
  triggerPriceModel?: 'MARK_PRICE' | 'LAST_PRICE';
}

export const DEFAULT_TRADING_CONFIG: TradingConfig = {
  timeframe: '5m',
  leverage: 125,
  riskPercent: 1,
  maxPositions: 10,
  takerFee: 0.001,
  makerFee: 0.001,
  slippage: 0.0005,
  riskRewardRatio: 1.2,
  triggerPriceModel: 'MARK_PRICE',
};

export const DEFAULT_MACD_CONFIG = {
  fast: 12,
  slow: 26,
  signal: 9,
} as const;

export const DEFAULT_EMA_PERIODS = [34, 89, 200, 610] as const;
export const DEFAULT_RSI_PERIOD = 14;

// ---- Constants ----

export const INITIAL_BALANCE = 1000;
export const SNAPSHOT_INTERVAL_MS = 15 * 60 * 1000; // 15 minutes
export const DISPLAY_TIMEZONE = 'Asia/Ho_Chi_Minh';
export const MAX_CANDLES_HISTORY = 1000;
export const EMA_WARMUP_CANDLES = 700; // Enough for EMA 610
export const BINANCE_FUTURES_BASE = 'https://fapi.binance.com';
// Binance retired the legacy USDⓈ-M Futures WebSocket routes on 2026-04-23.
export const BINANCE_FUTURES_WS = 'wss://fstream.binance.com/market';
