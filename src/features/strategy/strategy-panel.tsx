/**
 * Strategy Control Panel
 */
'use client';

import React, { useEffect, useState } from 'react';
import { cn, formatTimestamp } from '@/lib/utils';
import type { StrategyState, ConnectionStatus, Timeframe, TradingConfig } from '@/shared/types';
import { TIMEFRAMES } from '@/shared/types';
import { SIGNAL_STRENGTH_AUTO_ENTRY_THRESHOLD } from '@/shared/types';
import { X, Play, Pause, Square, RotateCcw, AlertTriangle, Activity } from 'lucide-react';
import { toast } from 'sonner';

interface StrategyPanelProps {
  strategy: StrategyState | null;
  connection: ConnectionStatus;
  onClose: () => void;
  symbols: string[];
  config: TradingConfig | null;
}

export function StrategyPanel({ strategy, connection, onClose, symbols, config }: StrategyPanelProps) {
  const [timeframe, setTimeframe] = useState<Timeframe>('5m');
  const [riskPercent, setRiskPercent] = useState(1);
  const [maxPositions, setMaxPositions] = useState(10);
  const [leverage, setLeverage] = useState(125);
  const [takerFee, setTakerFee] = useState(0.001);
  const [slippage, setSlippage] = useState(0.0005);
  const [riskRewardRatio, setRiskRewardRatio] = useState(1.2);
  const [enabledSymbols, setEnabledSymbols] = useState<string[] | null>(null);
  const [triggerPriceModel, setTriggerPriceModel] = useState<'MARK_PRICE' | 'LAST_PRICE'>('MARK_PRICE');

  // Synchronize editable form state when the engine's persisted config arrives or changes.
  useEffect(() => {
    // eslint-disable-next-line react-hooks/set-state-in-effect
    if (enabledSymbols === null && symbols.length) setEnabledSymbols(config?.enabledSymbols?.length ? config.enabledSymbols : symbols);
    if (config) {
      setTimeframe(config.timeframe ?? '5m');
      setRiskPercent(config.riskPercent);
      setMaxPositions(config.maxPositions);
      setLeverage(config.leverage);
      setTakerFee(config.takerFee);
      setSlippage(config.slippage);
      setRiskRewardRatio(config.riskRewardRatio ?? 1.2);
      setTriggerPriceModel(config.triggerPriceModel ?? 'MARK_PRICE');
    }
  }, [config, enabledSymbols, symbols]);
  const [loading, setLoading] = useState(false);

  const handleAction = async (action: string) => {
    setLoading(true);
    try {
      const body: any = { action };
      if (action === 'start') {
        body.config = {
          timeframe,
          riskPercent,
          maxPositions,
          leverage,
          takerFee,
          makerFee: takerFee,
          slippage,
          riskRewardRatio,
          enabledSymbols: enabledSymbols ?? symbols,
          triggerPriceModel,
        };
      }

      const res = await fetch('/api/strategy', {
        method: 'POST',
        headers: { 'Content-Type': 'application/json' },
        body: JSON.stringify(body),
      });

      const data = await res.json();
      if (data.success) {
        toast.success(`Strategy ${action}ed successfully`);
      } else {
        toast.error(data.error || `Failed to ${action} strategy`);
      }
    } catch (error) {
      toast.error(`Failed to ${action} strategy`);
    } finally {
      setLoading(false);
    }
  };

  const status = strategy?.status || 'IDLE';
  const isRunning = status === 'RUNNING';
  const isPaused = status === 'PAUSED';
  const isStopped = status === 'STOPPED' || status === 'IDLE';

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center bg-black/50">
      <div className="w-[480px] max-h-[90vh] bg-terminal-surface border border-terminal-border
                      rounded-md shadow-2xl overflow-auto">
        {/* Header */}
        <div className="flex items-center justify-between px-4 py-3 border-b border-terminal-border">
          <div className="flex items-center gap-2">
            <Activity className="w-4 h-4 text-terminal-accent" />
            <h2 className="text-sm font-semibold text-terminal-text">Strategy Control</h2>
          </div>
          <button aria-label="Close strategy settings" onClick={onClose} className="p-1 rounded hover:bg-terminal-border">
            <X className="w-4 h-4 text-terminal-text-muted" />
          </button>
        </div>

        {/* Status */}
        <div className="px-4 py-3 border-b border-terminal-border">
          <div className="flex items-center justify-between mb-2">
            <span className="text-xs text-terminal-text-muted">MACD Histogram Reversal</span>
            <span className={cn(
              'px-2 py-0.5 rounded text-xxs font-medium',
              isRunning ? 'bg-terminal-long-bg text-terminal-long' :
              isPaused ? 'bg-terminal-warning-bg text-terminal-warning' :
              'bg-terminal-border text-terminal-text-muted'
            )}>
              {status}
            </span>
          </div>

          <div className="grid grid-cols-3 gap-3 text-xxs">
            <div>
              <span className="text-terminal-text-muted">Symbols</span>
              <span className="block font-mono text-terminal-text">{strategy?.symbolsMonitored || 0}</span>
            </div>
            <div>
              <span className="text-terminal-text-muted">Total Signals</span>
              <span className="block font-mono text-terminal-text">{strategy?.totalSignals || 0}</span>
            </div>
            <div>
              <span className="text-terminal-text-muted">Rejected</span>
              <span className="block font-mono text-terminal-short">{strategy?.rejectedCount || 0}</span>
            </div>
          </div>
          <p className="mt-2 rounded border border-terminal-accent/20 bg-terminal-accent/5 px-2 py-1.5 text-[10px] text-terminal-text-secondary">
            Auto paper entry at strength ≥ {SIGNAL_STRENGTH_AUTO_ENTRY_THRESHOLD}/100 · one position per coin · maximum 10 open · RR 1:1.2
          </p>

          {strategy?.lastProcessedAt && (
            <div className="mt-2 text-xxs text-terminal-text-muted">
              Last processed: {formatTimestamp(strategy.lastProcessedAt)}
            </div>
          )}

          {strategy?.errorMessage && (
            <div className="mt-2 flex items-center gap-1.5 text-xxs text-terminal-warning">
              <AlertTriangle className="w-3 h-3" />
              {strategy.errorMessage}
            </div>
          )}
        </div>

        {/* Controls */}
        <div className="px-4 py-3 border-b border-terminal-border">
          <div className="flex gap-2 mb-4">
            {isStopped && (
              <button
                onClick={() => handleAction('start')}
                disabled={loading || connection !== 'CONNECTED'}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded
                           bg-terminal-long text-white text-xs font-medium
                           hover:bg-terminal-long/90 disabled:opacity-50 transition-colors"
              >
                <Play className="w-3.5 h-3.5" />
                Start
              </button>
            )}
            {isRunning && (
              <button
                onClick={() => handleAction('pause')}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded
                           bg-terminal-warning text-white text-xs font-medium
                           hover:bg-terminal-warning/90 disabled:opacity-50 transition-colors"
              >
                <Pause className="w-3.5 h-3.5" />
                Pause
              </button>
            )}
            {isPaused && (
              <button
                onClick={() => handleAction('resume')}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded
                           bg-terminal-long text-white text-xs font-medium
                           hover:bg-terminal-long/90 disabled:opacity-50 transition-colors"
              >
                <RotateCcw className="w-3.5 h-3.5" />
                Resume
              </button>
            )}
            {(isRunning || isPaused) && (
              <button
                onClick={() => {
                  if (confirm('Stop the strategy? Open positions will be maintained.')) {
                    handleAction('stop');
                  }
                }}
                disabled={loading}
                className="flex-1 flex items-center justify-center gap-1.5 px-3 py-2 rounded
                           bg-terminal-short text-white text-xs font-medium
                           hover:bg-terminal-short/90 disabled:opacity-50 transition-colors"
              >
                <Square className="w-3.5 h-3.5" />
                Stop
              </button>
            )}
          </div>

          {/* Note about positions */}
          {(isRunning || isPaused) && (
            <p className="text-xxs text-terminal-text-muted flex items-center gap-1">
              <AlertTriangle className="w-3 h-3 text-terminal-warning" />
              Pausing/stopping will not close existing positions. SL monitoring continues.
            </p>
          )}
        </div>

        {/* Configuration */}
        <div className="px-4 py-3">
          <h3 className="text-xs font-medium text-terminal-text mb-3">Configuration</h3>

          <div className="space-y-3">
            <ConfigField label="Timeframe">
              <div className="flex gap-1">
                {TIMEFRAMES.map(tf => (
                  <button
                    key={tf}
                    onClick={() => setTimeframe(tf)}
                    disabled={isRunning || isPaused}
                    className={cn(
                      'px-2 py-1 text-xxs rounded transition-colors',
                      tf === timeframe
                        ? 'bg-terminal-accent text-white'
                        : 'bg-terminal-border text-terminal-text-secondary hover:bg-terminal-muted',
                      (isRunning || isPaused) && 'opacity-50 cursor-not-allowed'
                    )}
                  >
                    {tf}
                  </button>
                ))}
              </div>
            </ConfigField>

            <ConfigField label="Risk per trade (%)">
              <input
                type="number"
                value={riskPercent}
                onChange={e => setRiskPercent(parseFloat(e.target.value) || 1)}
                min={0.1}
                max={10}
                step={0.1}
                disabled={isRunning || isPaused}
                className="w-20 px-2 py-1 text-xs bg-terminal-bg border border-terminal-border rounded
                           text-terminal-text font-mono focus:outline-none focus:border-terminal-accent
                           disabled:opacity-50"
              />
            </ConfigField>

            <ConfigField label="Max positions">
              <input
                type="number"
                value={maxPositions}
                onChange={e => setMaxPositions(parseInt(e.target.value) || 10)}
                min={1}
                max={10}
                disabled={isRunning || isPaused}
                className="w-20 px-2 py-1 text-xs bg-terminal-bg border border-terminal-border rounded
                           text-terminal-text font-mono focus:outline-none focus:border-terminal-accent
                           disabled:opacity-50"
              />
            </ConfigField>

            <ConfigField label="Risk : reward">
              <input type="number" value={riskRewardRatio} onChange={e => setRiskRewardRatio(parseFloat(e.target.value) || 1.2)} min={0.1} max={10} step={0.1} disabled={isRunning || isPaused} className="w-20 px-2 py-1 text-xs bg-terminal-bg border border-terminal-border rounded text-terminal-text font-mono focus:outline-none focus:border-terminal-accent disabled:opacity-50" />
            </ConfigField>

            <ConfigField label="Leverage">
              <input
                type="number"
                value={leverage}
                onChange={e => setLeverage(parseInt(e.target.value) || 1)}
                min={1}
                max={125}
                disabled={isRunning || isPaused}
                className="w-20 px-2 py-1 text-xs bg-terminal-bg border border-terminal-border rounded
                           text-terminal-text font-mono focus:outline-none focus:border-terminal-accent
                           disabled:opacity-50"
              />
            </ConfigField>

            <ConfigField label="Taker fee (per side)">
              <input
                type="number"
                value={takerFee}
                onChange={e => setTakerFee(parseFloat(e.target.value) || 0.001)}
                min={0}
                max={0.01}
                step={0.0001}
                disabled={isRunning || isPaused}
                className="w-24 px-2 py-1 text-xs bg-terminal-bg border border-terminal-border rounded
                           text-terminal-text font-mono focus:outline-none focus:border-terminal-accent
                           disabled:opacity-50"
              />
              <span className="text-xxs text-terminal-text-muted ml-1">({(takerFee * 100).toFixed(2)}%)</span>
            </ConfigField>

            <ConfigField label="Slippage">
              <input
                type="number"
                value={slippage}
                onChange={e => setSlippage(parseFloat(e.target.value) || 0.0005)}
                min={0}
                max={0.01}
                step={0.0001}
                disabled={isRunning || isPaused}
                className="w-24 px-2 py-1 text-xs bg-terminal-bg border border-terminal-border rounded
                           text-terminal-text font-mono focus:outline-none focus:border-terminal-accent
                           disabled:opacity-50"
              />
              <span className="text-xxs text-terminal-text-muted ml-1">({(slippage * 100).toFixed(2)}%)</span>
            </ConfigField>

            <ConfigField label={`Enabled symbols (${enabledSymbols?.length ?? symbols.length}/${symbols.length})`}>
              <div className="flex max-h-24 max-w-[300px] flex-wrap justify-end gap-1 overflow-y-auto">
                {symbols.map(item => {
                  const selected = (enabledSymbols ?? symbols).includes(item);
                  return <button key={item} type="button" aria-pressed={selected} disabled={isRunning || isPaused} onClick={() => setEnabledSymbols(current => {
                    const currentSelection = current ?? symbols;
                    return selected ? currentSelection.filter(value => value !== item) : [...currentSelection, item];
                  })} className={cn('rounded px-1.5 py-1 text-[9px]', selected ? 'bg-terminal-accent text-white' : 'bg-terminal-border text-terminal-text-muted', (isRunning || isPaused) && 'opacity-50')}>{item.replace('USDT', '')}</button>;
                })}
              </div>
            </ConfigField>

            <ConfigField label="SL/TP trigger price">
              <select value={triggerPriceModel} onChange={event => setTriggerPriceModel(event.target.value as 'MARK_PRICE' | 'LAST_PRICE')} disabled={isRunning || isPaused} className="rounded border border-terminal-border bg-terminal-bg px-2 py-1 text-xs text-terminal-text disabled:opacity-50"><option value="MARK_PRICE">Mark price</option><option value="LAST_PRICE">Last trade</option></select>
            </ConfigField>
          </div>

          {/* MACD Parameters (read-only display) */}
          <div className="mt-4 pt-3 border-t border-terminal-border">
            <h4 className="text-xxs font-medium text-terminal-text-muted mb-2">MACD Parameters (Fixed)</h4>
            <div className="flex gap-4 text-xxs text-terminal-text-secondary font-mono">
              <span>Fast: 12</span>
              <span>Slow: 26</span>
              <span>Signal: 9</span>
            </div>
          </div>
        </div>
      </div>
    </div>
  );
}

function ConfigField({ label, children }: { label: string; children: React.ReactNode }) {
  return (
    <div className="flex items-center justify-between">
      <span className="text-xs text-terminal-text-secondary">{label}</span>
      <div className="flex items-center">{children}</div>
    </div>
  );
}
