/**
 * Main Trading Terminal Component
 * Assembles all UI sections into a professional trading workspace
 */
'use client';

import React, { useMemo, useState } from 'react';
import { useEngineStream } from '@/hooks/use-engine-stream';
import { Header } from './header';
import { ChartWorkspace } from '@/features/chart/chart-workspace';
import { TradeTable } from '@/features/trades/trade-table';
import { StrategyPanel } from '@/features/strategy/strategy-panel';
import type { Timeframe } from '@/shared/types';
import { cn, formatPrice } from '@/lib/utils';

export function TradingTerminal() {
  const [selectedSymbol, setSelectedSymbol] = useState('BTCUSDT');
  const [selectedTimeframe, setSelectedTimeframe] = useState<Timeframe>('5m');
  const [showStrategyPanel, setShowStrategyPanel] = useState(false);
  const engineState = useEngineStream(selectedSymbol, selectedTimeframe);

  // Live mark prices as a Map keyed by symbol (rebuilt only when prices change)
  const markPrices = useMemo(
    () => new Map(Object.entries(engineState.markPrices)),
    [engineState.markPrices]
  );

  return (
    <div className="flex flex-col h-screen overflow-hidden">
      {/* Global Header */}
      <Header
        account={engineState.account}
        strategy={engineState.strategy}
        connection={engineState.connection}
        isConnected={engineState.isConnected}
        positions={engineState.positions}
        notifications={engineState.notifications}
        markPrices={engineState.markPrices}
        lastPrices={engineState.lastPrices}
        config={engineState.config}
        onOpenStrategy={() => setShowStrategyPanel(true)}
      />

      {/* Main Content */}
      <div className="flex min-h-0 flex-1 overflow-hidden">
        <aside className="hidden w-56 shrink-0 flex-col border-r border-terminal-border bg-terminal-surface sm:flex">
          <div className="border-b border-terminal-border px-3 py-3">
            <div className="text-xs font-semibold uppercase tracking-wider text-terminal-text">Watchlist</div>
            <div className="mt-1 text-[10px] text-terminal-text-muted">{engineState.symbols.length} Binance USDT perpetuals</div>
          </div>
          <div className="flex-1 overflow-y-auto">
            {engineState.symbols.map(symbol => {
              const price = engineState.markPrices[symbol] ?? engineState.lastPrices[symbol];
              const active = selectedSymbol === symbol;
              return <button key={symbol} type="button" onClick={() => setSelectedSymbol(symbol)}
                className={cn('flex w-full items-center justify-between border-b border-terminal-border/70 px-3 py-2.5 text-left transition-colors hover:bg-terminal-border/60', active && 'bg-terminal-border')}
                aria-pressed={active}>
                <span className="min-w-0">
                  <span className="block text-xs font-semibold text-terminal-text">{symbol.replace('USDT', '')}</span>
                  <span className="block text-[10px] text-terminal-text-muted">USDT · Perpetual</span>
                </span>
                <span className="ml-2 text-right font-mono text-[11px] tabular-nums text-terminal-text-secondary">{price ? formatPrice(price) : '—'}</span>
              </button>;
            })}
            {engineState.symbols.length === 0 && <div className="px-3 py-4 text-xs text-terminal-text-muted">Connecting to market…</div>}
          </div>
        </aside>
        <div className="min-w-0 flex-1 overflow-auto">
          <ChartWorkspace
            symbol={selectedSymbol}
            timeframe={selectedTimeframe}
            onSymbolChange={setSelectedSymbol}
            onTimeframeChange={setSelectedTimeframe}
            positions={engineState.positions}
            liveCandle={engineState.lastCandle}
            notifications={engineState.notifications}
          />
          <TradeTable positions={engineState.positions} markPrices={markPrices} />
        </div>
      </div>

      {/* Strategy Control Panel */}
      {showStrategyPanel && (
        <StrategyPanel
          strategy={engineState.strategy}
          connection={engineState.connection}
          symbols={engineState.symbols}
          config={engineState.config}
          onClose={() => setShowStrategyPanel(false)}
        />
      )}
    </div>
  );
}
