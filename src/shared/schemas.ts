import { z } from 'zod';
import { TIMEFRAMES } from './types';

export const TimeframeSchema = z.enum(TIMEFRAMES);

export const SideSchema = z.enum(['LONG', 'SHORT']);

export const TradingConfigSchema = z.object({
  leverage: z.number().int().min(1).max(125).default(125),
  riskPercent: z.number().min(0.1).max(10).default(1),
  maxPositions: z.number().int().min(1).max(20).default(10),
  takerFee: z.number().min(0).max(0.01).default(0.001),
  makerFee: z.number().min(0).max(0.01).default(0.001),
  slippage: z.number().min(0).max(0.01).default(0.0005),
  riskRewardRatio: z.number().min(0.1).max(10).default(2),
  triggerPriceModel: z.enum(['MARK_PRICE', 'LAST_PRICE']).default('MARK_PRICE'),
});

export const StrategyConfigSchema = z.object({
  timeframe: TimeframeSchema.default('5m'),
  riskPercent: z.number().min(0.1).max(10).default(1),
  maxPositions: z.number().int().min(1).max(20).default(10),
  leverage: z.number().int().min(1).max(125).default(125),
  takerFee: z.number().min(0).max(0.01).default(0.001),
  makerFee: z.number().min(0).max(0.01).default(0.001),
  slippage: z.number().min(0).max(0.01).default(0.0005),
  riskRewardRatio: z.number().min(0.1).max(10).default(2),
  triggerPriceModel: z.enum(['MARK_PRICE', 'LAST_PRICE']).default('MARK_PRICE'),
  enabledSymbols: z.array(z.string()).optional(),
  macdFast: z.number().int().min(1).default(12),
  macdSlow: z.number().int().min(1).default(26),
  macdSignal: z.number().int().min(1).default(9),
});

export const StrategyActionSchema = z.enum(['start', 'pause', 'resume', 'stop']);

export const SymbolFilterSchema = z.object({
  symbol: z.string().optional(),
  side: SideSchema.optional(),
  status: z.enum(['OPEN', 'CLOSED']).optional(),
  startTime: z.number().optional(),
  endTime: z.number().optional(),
  page: z.number().int().min(1).default(1),
  pageSize: z.number().int().min(1).max(100).default(50),
});

export const ClosePositionSchema = z.object({
  positionId: z.string().uuid(),
  reason: z.enum(['MANUAL', 'STRATEGY_CLOSE']).default('MANUAL'),
});

export const CandleSchema = z.object({
  openTime: z.number(),
  open: z.number(),
  high: z.number(),
  low: z.number(),
  close: z.number(),
  volume: z.number(),
  closeTime: z.number(),
  quoteVolume: z.number(),
  trades: z.number(),
  isClosed: z.boolean(),
});
