/**
 * Binance Futures WebSocket client for real-time market data
 */

import WebSocket from 'ws';
import type { Candle, Timeframe } from '@/shared/types';
import { BINANCE_FUTURES_WS } from '@/shared/types';
import { logger } from '../utils/logger';

export type CandleCallback = (symbol: string, timeframe: Timeframe, candle: Candle) => void;
export type MarkPriceCallback = (symbol: string, markPrice: number, fundingRate: number, nextFundingTime: number) => void;

interface StreamSubscription {
  symbol: string;
  timeframe: Timeframe;
}

export class BinanceWebSocket {
  private ws: WebSocket | null = null;
  private subscriptions: StreamSubscription[] = [];
  private onCandle: CandleCallback | null = null;
  private onMarkPrice: MarkPriceCallback | null = null;
  private reconnectTimer: NodeJS.Timeout | null = null;
  private pingTimer: NodeJS.Timeout | null = null;
  private isConnected = false;
  private shouldReconnect = true;
  private reconnectAttempts = 0;
  private maxReconnectAttempts = 50;
  private reconnectBaseDelay = 1000;
  private lastPong = 0;
  private connectionStatusCallback: ((status: string) => void) | null = null;

  setCandleHandler(handler: CandleCallback) {
    this.onCandle = handler;
  }

  setMarkPriceHandler(handler: MarkPriceCallback) {
    this.onMarkPrice = handler;
  }

  setConnectionStatusHandler(handler: (status: string) => void) {
    this.connectionStatusCallback = handler;
  }

  subscribe(symbols: string[], timeframe: Timeframe | readonly Timeframe[]) {
    const timeframes = typeof timeframe === 'string' ? [timeframe] : timeframe;
    this.subscriptions = symbols.flatMap(symbol => timeframes.map(timeframe => ({ symbol, timeframe })));
    if (this.isConnected) {
      this.disconnect();
    }
    this.shouldReconnect = true;
    this.connect();
  }

  updateSubscriptions(symbols: string[], timeframe: Timeframe | readonly Timeframe[]) {
    const timeframes = typeof timeframe === 'string' ? [timeframe] : timeframe;
    this.subscriptions = symbols.flatMap(symbol => timeframes.map(timeframe => ({ symbol, timeframe })));
    this.shouldReconnect = true;
    this.reconnect();
  }

  private buildStreamUrl(): string {
    const streams: string[] = [];

    for (const sub of this.subscriptions) {
      const sym = sub.symbol.toLowerCase();
      streams.push(`${sym}@kline_${sub.timeframe}`);
    }

    // Add mark price streams (at 1s interval)
    const uniqueSymbols = Array.from(new Set(this.subscriptions.map(s => s.symbol.toLowerCase())));
    for (const sym of uniqueSymbols) {
      streams.push(`${sym}@markPrice@1s`);
    }

    if (streams.length === 0) {
      return `${BINANCE_FUTURES_WS}/ws`;
    }

    return `${BINANCE_FUTURES_WS}/stream?streams=${streams.join('/')}`;
  }

  private connect() {
    if (this.subscriptions.length === 0) return;

    const url = this.buildStreamUrl();
    logger.info(`[WS] Connecting to ${url.substring(0, 80)}...`);
    this.connectionStatusCallback?.('CONNECTING');

    try {
      this.ws = new WebSocket(url);

      this.ws.on('open', () => {
        logger.info('[WS] Connected');
        this.isConnected = true;
        this.reconnectAttempts = 0;
        this.lastPong = Date.now();
        this.connectionStatusCallback?.('CONNECTED');
        this.startPingInterval();
      });

      this.ws.on('message', (data: Buffer) => {
        try {
          const msg = JSON.parse(data.toString());
          this.handleMessage(msg);
        } catch (err) {
          logger.error('[WS] Parse error', err);
        }
      });

      this.ws.on('close', (code, reason) => {
        logger.warn(`[WS] Closed: ${code} ${reason.toString()}`);
        this.isConnected = false;
        this.stopPingInterval();
        this.connectionStatusCallback?.('DISCONNECTED');
        if (this.shouldReconnect) {
          this.scheduleReconnect();
        }
      });

      this.ws.on('error', (err) => {
        logger.error('[WS] Error', err);
        this.connectionStatusCallback?.('ERROR');
      });

      this.ws.on('pong', () => {
        this.lastPong = Date.now();
      });
    } catch (err) {
      logger.error('[WS] Connection error', err);
      this.connectionStatusCallback?.('ERROR');
      if (this.shouldReconnect) {
        this.scheduleReconnect();
      }
    }
  }

  private handleMessage(msg: any) {
    const data = msg.data || msg;
    if (!data || !data.e) return;

    if (data.e === 'kline') {
      const k = data.k;
      const candle: Candle = {
        openTime: k.t,
        open: parseFloat(k.o),
        high: parseFloat(k.h),
        low: parseFloat(k.l),
        close: parseFloat(k.c),
        volume: parseFloat(k.v),
        closeTime: k.T,
        quoteVolume: parseFloat(k.q),
        trades: k.n,
        isClosed: k.x,
      };
      const symbol = data.s;
      const timeframe = k.i as Timeframe;
      this.onCandle?.(symbol, timeframe, candle);
    } else if (data.e === 'markPriceUpdate') {
      const symbol = data.s;
      const markPrice = parseFloat(data.p);
      const fundingRate = parseFloat(data.r);
      const nextFundingTime = data.T;
      this.onMarkPrice?.(symbol, markPrice, fundingRate, nextFundingTime);
    }
  }

  private scheduleReconnect() {
    if (this.reconnectAttempts >= this.maxReconnectAttempts) {
      logger.error('[WS] Max reconnect attempts reached');
      this.connectionStatusCallback?.('ERROR');
      return;
    }

    const delay = Math.min(
      this.reconnectBaseDelay * Math.pow(2, this.reconnectAttempts),
      30000
    );
    this.reconnectAttempts++;
    this.connectionStatusCallback?.('RECONNECTING');
    logger.info(`[WS] Reconnecting in ${delay}ms (attempt ${this.reconnectAttempts})`);

    this.reconnectTimer = setTimeout(() => {
      this.connect();
    }, delay);
  }

  private startPingInterval() {
    this.stopPingInterval();
    this.pingTimer = setInterval(() => {
      if (this.ws?.readyState === WebSocket.OPEN) {
        this.ws.ping();
        if (Date.now() - this.lastPong > 30000) {
          logger.warn('[WS] Stale connection detected, reconnecting');
          this.shouldReconnect = true;
          this.reconnect();
        }
      }
    }, 10000);
  }

  private stopPingInterval() {
    if (this.pingTimer) {
      clearInterval(this.pingTimer);
      this.pingTimer = null;
    }
  }

  private reconnect() {
    const subs = [...this.subscriptions];
    this.disconnect();
    this.subscriptions = subs;
    this.shouldReconnect = true;
    this.connect();
  }

  disconnect() {
    this.shouldReconnect = false;
    this.stopPingInterval();
    if (this.reconnectTimer) {
      clearTimeout(this.reconnectTimer);
      this.reconnectTimer = null;
    }
    if (this.ws) {
      this.ws.removeAllListeners();
      if (this.ws.readyState === WebSocket.OPEN || this.ws.readyState === WebSocket.CONNECTING) {
        this.ws.close();
      }
      this.ws = null;
    }
    this.isConnected = false;
    this.connectionStatusCallback?.('DISCONNECTED');
  }

  getConnectionStatus(): string {
    if (this.isConnected) return 'CONNECTED';
    if (this.reconnectTimer) return 'RECONNECTING';
    return 'DISCONNECTED';
  }
}
