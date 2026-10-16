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
      <div className="flex-1 overflow-auto">
        {/* Chart Workspace */}
        <ChartWorkspace
          symbol={selectedSymbol}
          timeframe={selectedTimeframe}
          onSymbolChange={setSelectedSymbol}
          onTimeframeChange={setSelectedTimeframe}
          positions={engineState.positions}
          liveCandle={engineState.lastCandle}
          notifications={engineState.notifications}
        />

        {/* Trade Table */}
        <TradeTable
          positions={engineState.positions}
          markPrices={markPrices}
        />
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
