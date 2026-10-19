import { logger } from '../utils/logger';
import type { SignalAction, SignalStrengthBreakdown, SignalStrengthLabel, Timeframe } from '@/shared/types';

interface TelegramSignalAlert {
  symbol: string;
  timeframe: Timeframe;
  action: SignalAction;
  entryPrice: number | null;
  stopLoss: number | null;
  takeProfit: number | null;
  macdLine: number;
  macdSignal: number;
  macdHistogram: number;
  prevHistogram: number;
  strengthScore: number;
  strengthLabel: SignalStrengthLabel;
  strengthBreakdown: SignalStrengthBreakdown;
  executionStatus: string;
  rejectReason: string | null;
  expiresAt: number;
}

interface TelegramApiResponse {
  ok?: boolean;
  description?: string;
  parameters?: { retry_after?: number };
}

let warnedAboutPartialConfig = false;

function escapeHtml(value: string): string {
  return value.replaceAll('&', '&amp;').replaceAll('<', '&lt;').replaceAll('>', '&gt;');
}

function formatNumber(value: number | null): string {
  return value === null ? 'n/a' : new Intl.NumberFormat('en-US', { maximumSignificantDigits: 10 }).format(value);
}

function delay(ms: number): Promise<void> {
  return new Promise(resolve => setTimeout(resolve, ms));
}

/** Send actionable signals to Telegram without blocking signal persistence or SSE delivery. */
export async function sendTelegramSignalAlert(signal: TelegramSignalAlert): Promise<void> {
  const token = process.env.TELEGRAM_BOT_TOKEN?.trim();
  const chatId = process.env.TELEGRAM_CHAT_ID?.trim();
  if (!token && !chatId) return;
  if (!token || !chatId) {
    if (!warnedAboutPartialConfig) {
      warnedAboutPartialConfig = true;
      logger.warn('[Telegram] Configure both TELEGRAM_BOT_TOKEN and TELEGRAM_CHAT_ID to enable alerts');
    }
    return;
  }

  const isLong = signal.action === 'ENTRY_LONG';
  const side = isLong ? 'LONG' : 'SHORT';
  const sideEmoji = isLong ? '🟢' : '🔴';
  const validUntil = new Date(signal.expiresAt).toISOString().replace('T', ' ').replace(/\.\d{3}Z$/, ' UTC');
  const message = [
    '📡 <b>MACD REVERSAL SIGNAL</b>',
    '━━━━━━━━━━━━━━━━━━',
    `${sideEmoji} <b>${escapeHtml(signal.symbol)} · ${side}</b>  ·  <code>${escapeHtml(signal.timeframe)}</code>`,
    '',
    '💹 <b>ENTRY SETUP</b>',
    `🎯 <b>Signal reference:</b> <code>${formatNumber(signal.entryPrice)}</code>`,
    `🛑 <b>Stop loss:</b> <code>${formatNumber(signal.stopLoss)}</code>`,
    `🏁 <b>Take profit · 1:1.2:</b> <code>${formatNumber(signal.takeProfit)}</code>`,
    '',
    '💪 <b>SIGNAL STRENGTH</b>',
    `Score  <b>${signal.strengthScore}/100 · ${escapeHtml(signal.strengthLabel)}</b>  ·  Auto-entry threshold 50`,
    `EMA ${signal.strengthBreakdown.emaAlignment}/25 · MACD ${signal.strengthBreakdown.macdMomentum}/25 · Wave ${signal.strengthBreakdown.waveContext}/20`,
    `RSI ${signal.strengthBreakdown.rsi}/10 · Volume ${signal.strengthBreakdown.volume}/10 · SL ${signal.strengthBreakdown.stopQuality}/10`,
    '',
    '📊 <b>MACD MOMENTUM</b>',
    `MACD / Signal  <code>${formatNumber(signal.macdLine)} / ${formatNumber(signal.macdSignal)}</code>`,
    `Histogram  <code>${formatNumber(signal.prevHistogram)} → ${formatNumber(signal.macdHistogram)}</code>`,
    '',
    `🤖 <b>${escapeHtml(signal.executionStatus)}</b>`,
    signal.rejectReason ? `Reason  ${escapeHtml(signal.rejectReason)}` : '',
    '',
    `⏳ <b>Valid until</b>  ${validUntil}`,
  ].filter(Boolean).join('\n');

  for (let attempt = 1; attempt <= 3; attempt++) {
    try {
      const response = await fetch(`https://api.telegram.org/bot${token}/sendMessage`, {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify({ chat_id: chatId, text: message, parse_mode: 'HTML' }),
        signal: AbortSignal.timeout(5_000),
      });
      const result = await response.json().catch(() => null) as TelegramApiResponse | null;
      if (response.ok && result?.ok) {
        logger.info(`[Telegram] Alert sent: ${signal.symbol} ${side} ${signal.timeframe}`);
        return;
      }

      const retryable = response.status === 429 || response.status >= 500;
      if (retryable && attempt < 3) {
        const retryAfterMs = Math.min((result?.parameters?.retry_after ?? attempt) * 1000, 5_000);
        await delay(retryAfterMs);
        continue;
      }

      logger.warn(`[Telegram] Alert rejected (HTTP ${response.status}): ${result?.description ?? 'Telegram API error'}`);
      return;
    } catch {
      if (attempt < 3) {
        await delay(attempt * 300);
        continue;
      }
      logger.warn(`[Telegram] Alert delivery failed after ${attempt} attempts: ${signal.symbol} ${side} ${signal.timeframe}`);
    }
  }
}
