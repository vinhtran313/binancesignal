/**
 * Trade History Table - Open and Closed positions
 */
'use client';

import React, { useState, useMemo } from 'react';
import {
  cn,
  formatPrice,
  formatUSDT,
  formatPercent,
  formatQuantity,
  formatTimestamp,
  pnlColor,
  sideColor,
  sideBg,
} from '@/lib/utils';
import type { Position } from '@/shared/types';
import { Filter, ChevronDown, ChevronUp, Eye } from 'lucide-react';

interface TradeTableProps {
  positions: Position[];
  markPrices: Map<string, number>;
}

type SortKey = 'entryTime' | 'symbol' | 'side' | 'netPnl' | 'pnlPercent';
type SortDir = 'asc' | 'desc';

interface Filters {
  status: 'ALL' | 'OPEN' | 'CLOSED';
  side: 'ALL' | 'LONG' | 'SHORT';
  symbol: string;
  startDate: string;
  endDate: string;
}

export function TradeTable({ positions, markPrices }: TradeTableProps) {
  const [sortKey, setSortKey] = useState<SortKey>('entryTime');
  const [sortDir, setSortDir] = useState<SortDir>('desc');
  const [filters, setFilters] = useState<Filters>({ status: 'ALL', side: 'ALL', symbol: '', startDate: '', endDate: '' });
  const [expandedId, setExpandedId] = useState<string | null>(null);
  const [showFilters, setShowFilters] = useState(false);

  const toggleSort = (key: SortKey) => {
    if (sortKey === key) {
      setSortDir(d => d === 'asc' ? 'desc' : 'asc');
    } else {
      setSortKey(key);
      setSortDir('desc');
    }
  };

  const filtered = useMemo(() => {
    return positions.filter(p => {
      if (filters.status !== 'ALL' && p.status !== filters.status) return false;
      if (filters.side !== 'ALL' && p.side !== filters.side) return false;
      if (filters.symbol && !p.symbol.toLowerCase().includes(filters.symbol.toLowerCase())) return false;
      if (filters.startDate && p.entryTime < new Date(`${filters.startDate}T00:00:00`).getTime()) return false;
      if (filters.endDate && p.entryTime > new Date(`${filters.endDate}T23:59:59.999`).getTime()) return false;
      return true;
    });
  }, [positions, filters]);

  const sorted = useMemo(() => {
    return [...filtered].sort((a, b) => {
      let aVal: number, bVal: number;
      switch (sortKey) {
        case 'entryTime':
          aVal = a.entryTime;
          bVal = b.entryTime;
          break;
        case 'symbol':
          return sortDir === 'asc'
            ? a.symbol.localeCompare(b.symbol)
            : b.symbol.localeCompare(a.symbol);
        case 'side':
          return sortDir === 'asc'
            ? a.side.localeCompare(b.side)
            : b.side.localeCompare(a.side);
        case 'netPnl':
          aVal = a.netPnl ?? a.unrealizedPnl ?? 0;
          bVal = b.netPnl ?? b.unrealizedPnl ?? 0;
          break;
        case 'pnlPercent':
          aVal = a.pnlPercent ?? 0;
          bVal = b.pnlPercent ?? 0;
          break;
        default:
          aVal = a.entryTime;
          bVal = b.entryTime;
      }
      return sortDir === 'asc' ? aVal - bVal : bVal - aVal;
    });
  }, [filtered, sortKey, sortDir]);

  const openCount = positions.filter(p => p.status === 'OPEN').length;
  const closedCount = positions.filter(p => p.status === 'CLOSED').length;
  const totalRealizedPnl = positions
    .filter(p => p.status === 'CLOSED' && p.netPnl !== null)
    .reduce((sum, p) => sum + (p.netPnl || 0), 0);

  return (
    <div className="border-t border-terminal-border bg-terminal-bg">
      {/* Table Header */}
      <div className="flex items-center justify-between px-4 py-2 border-b border-terminal-border bg-terminal-surface">
        <div className="flex items-center gap-4">
          <h2 className="text-sm font-semibold text-terminal-text">Trades</h2>
          <div className="flex items-center gap-3 text-xxs">
            <span className="text-terminal-text-muted">
              Open: <span className="text-terminal-text">{openCount}</span>
            </span>
            <span className="text-terminal-text-muted">
              Closed: <span className="text-terminal-text">{closedCount}</span>
            </span>
            <span className="text-terminal-text-muted">
              Net PnL: <span className={pnlColor(totalRealizedPnl)}>{formatUSDT(totalRealizedPnl, 4)}</span>
            </span>
          </div>
        </div>
        <div className="flex items-center gap-2">
          <button
            onClick={() => setShowFilters(!showFilters)}
            className={cn(
              'flex items-center gap-1 px-2 py-1 rounded text-xxs transition-colors',
              showFilters ? 'bg-terminal-accent text-white' : 'text-terminal-text-secondary hover:bg-terminal-border'
            )}
          >
            <Filter className="w-3 h-3" />
            Filters
          </button>
        </div>
      </div>

      {/* Filters */}
      {showFilters && (
        <div className="flex items-center gap-4 px-4 py-2 border-b border-terminal-border bg-terminal-surface">
          <div className="flex items-center gap-2">
            <span className="text-xxs text-terminal-text-muted">Status:</span>
            {(['ALL', 'OPEN', 'CLOSED'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilters(f => ({ ...f, status: s }))}
                className={cn(
                  'px-2 py-0.5 rounded text-xxs transition-colors',
                  filters.status === s ? 'bg-terminal-accent text-white' : 'text-terminal-text-secondary hover:bg-terminal-border'
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <div className="flex items-center gap-2">
            <span className="text-xxs text-terminal-text-muted">Side:</span>
            {(['ALL', 'LONG', 'SHORT'] as const).map(s => (
              <button
                key={s}
                onClick={() => setFilters(f => ({ ...f, side: s }))}
                className={cn(
                  'px-2 py-0.5 rounded text-xxs transition-colors',
                  filters.side === s ? 'bg-terminal-accent text-white' : 'text-terminal-text-secondary hover:bg-terminal-border'
                )}
              >
                {s}
              </button>
            ))}
          </div>
          <input
            type="text"
            placeholder="Filter symbol..."
            value={filters.symbol}
            onChange={e => setFilters(f => ({ ...f, symbol: e.target.value }))}
            className="px-2 py-1 text-xxs bg-terminal-bg border border-terminal-border rounded
                       text-terminal-text placeholder-terminal-text-muted w-24
                       focus:outline-none focus:border-terminal-accent"
          />
          <label className="flex items-center gap-1 text-[9px] text-terminal-text-muted">From <input aria-label="Trade start date" type="date" value={filters.startDate} onChange={e => setFilters(f => ({ ...f, startDate: e.target.value }))} className="rounded border border-terminal-border bg-terminal-bg px-1 py-1 text-[10px] text-terminal-text" /></label>
          <label className="flex items-center gap-1 text-[9px] text-terminal-text-muted">To <input aria-label="Trade end date" type="date" value={filters.endDate} onChange={e => setFilters(f => ({ ...f, endDate: e.target.value }))} className="rounded border border-terminal-border bg-terminal-bg px-1 py-1 text-[10px] text-terminal-text" /></label>
        </div>
      )}

      {/* Table */}
      <div className="overflow-x-auto">
        <table className="w-full text-xs">
          <thead>
            <tr className="border-b border-terminal-border bg-terminal-surface">
              {[
                { key: 'entryTime', label: 'Time', width: 'w-28' },
                { key: 'symbol', label: 'Symbol', width: 'w-20' },
                { key: 'side', label: 'Side', width: 'w-14' },
                { key: null, label: 'Status', width: 'w-16' },
                { key: null, label: 'Entry', width: 'w-24' },
                { key: null, label: 'Exit', width: 'w-24' },
                { key: null, label: 'Qty', width: 'w-20' },
                { key: null, label: 'SL', width: 'w-24' },
                { key: null, label: 'TP', width: 'w-24' },
                { key: null, label: 'Margin', width: 'w-20' },
                { key: null, label: 'Fees', width: 'w-18' },
                { key: 'netPnl', label: 'Net PnL', width: 'w-24' },
                { key: 'pnlPercent', label: 'PnL%', width: 'w-18' },
                { key: null, label: 'Exit', width: 'w-16' },
                { key: null, label: '', width: 'w-8' },
              ].map(({ key, label, width }, index) => (
                <th
                  key={`${label || 'actions'}-${index}`}
                  onClick={() => key && toggleSort(key as SortKey)}
                  className={cn(
                    'px-2 py-1.5 text-left text-xxs font-medium text-terminal-text-muted',
                    width,
                    key && 'cursor-pointer hover:text-terminal-text'
                  )}
                >
                  <span className="flex items-center gap-1">
                    {label}
                    {key && sortKey === key && (
                      sortDir === 'asc' ? <ChevronUp className="w-3 h-3" /> : <ChevronDown className="w-3 h-3" />
                    )}
                  </span>
                </th>
              ))}
            </tr>
          </thead>
          <tbody>
            {sorted.length === 0 ? (
              <tr>
                <td colSpan={15} className="px-4 py-8 text-center text-xs text-terminal-text-muted">
                  {positions.length === 0
                    ? 'No trades yet. Review an actionable signal and confirm it to open a paper trade.'
                    : 'No trades match the current filters.'}
                </td>
              </tr>
            ) : (
              sorted.map(pos => {
                // Live unrealized PnL: prefer the latest mark price when available
                const mark = markPrices.get(pos.symbol);
                const liveUPnl =
                  pos.status === 'OPEN' && mark && mark > 0
                    ? pos.side === 'LONG'
                      ? pos.quantity * (mark - pos.entryPrice)
                      : pos.quantity * (pos.entryPrice - mark)
                    : pos.unrealizedPnl;
                const liveUPnlPct =
                  pos.status === 'OPEN' && pos.margin
                    ? (liveUPnl / pos.margin) * 100
                    : pos.pnlPercent;

                return (
                <React.Fragment key={pos.id}>
                  <tr className={cn(
                    'border-b border-terminal-border hover:bg-terminal-surface/50 transition-colors',
                    pos.status === 'OPEN' && 'bg-terminal-surface/30'
                  )}>
                    <td className="px-2 py-1.5 font-mono text-terminal-text-secondary font-tabular">
                      {formatTimestamp(pos.entryTime)}
                    </td>
                    <td className="px-2 py-1.5 font-medium text-terminal-text">
                      {pos.symbol.replace('USDT', '')}
                    </td>
                    <td className="px-2 py-1.5">
                      <span className={cn(
                        'px-1.5 py-0.5 rounded text-xxs font-medium',
                        sideBg(pos.side),
                        sideColor(pos.side)
                      )}>
                        {pos.side}
                      </span>
                    </td>
                    <td className="px-2 py-1.5">
                      <span className={cn(
                        'text-xxs font-medium',
                        pos.status === 'OPEN' ? 'text-terminal-accent' : 'text-terminal-text-muted'
                      )}>
                        {pos.status}
                      </span>
                    </td>
                    <td className="px-2 py-1.5 font-mono font-tabular text-terminal-text-secondary">
                      {formatPrice(pos.entryPrice)}
                    </td>
                    <td className="px-2 py-1.5 font-mono font-tabular text-terminal-text-secondary">
                      {pos.exitPrice ? formatPrice(pos.exitPrice) : '—'}
                    </td>
                    <td className="px-2 py-1.5 font-mono font-tabular text-terminal-text-secondary">
                      {formatQuantity(pos.quantity)}
                    </td>
                    <td className="px-2 py-1.5 font-mono font-tabular text-terminal-short">
                      {formatPrice(pos.stopLoss)}
                    </td>
                    <td className="px-2 py-1.5 font-mono font-tabular text-terminal-long">
                      {formatPrice(pos.takeProfit)}
                    </td>
                    <td className="px-2 py-1.5 font-mono font-tabular text-terminal-text-secondary">
                      {formatUSDT(pos.margin)}
                    </td>
                    <td className="px-2 py-1.5 font-mono font-tabular text-terminal-text-muted">
                      {formatUSDT(pos.totalFees, 4)}
                    </td>
                    <td className={cn('px-2 py-1.5 font-mono font-tabular font-medium',
                      pos.status === 'OPEN'
                        ? pnlColor(liveUPnl)
                        : pnlColor(pos.netPnl)
                    )}>
                      {pos.status === 'OPEN'
                        ? formatUSDT(liveUPnl, 4)
                        : formatUSDT(pos.netPnl, 4)}
                    </td>
                    <td className={cn('px-2 py-1.5 font-mono font-tabular',
                      pnlColor(liveUPnlPct ?? pos.unrealizedPnl)
                    )}>
                      {pos.status === 'OPEN'
                        ? (pos.margin ? formatPercent(liveUPnlPct) : '—')
                        : formatPercent(pos.pnlPercent)}
                    </td>
                    <td className="px-2 py-1.5 text-xxs text-terminal-text-muted">
                      {pos.exitReason || (pos.status === 'OPEN' ? (
                        <button
                          onClick={() => handleClosePosition(pos.id)}
                          className="px-1.5 py-0.5 rounded text-xxs bg-terminal-short/20 text-terminal-short
                                     hover:bg-terminal-short/30 transition-colors"
                        >
                          Close
                        </button>
                      ) : '—')}
                    </td>
                    <td className="px-2 py-1.5">
                      <button
                        onClick={() => setExpandedId(expandedId === pos.id ? null : pos.id)}
                        className="p-0.5 rounded hover:bg-terminal-border text-terminal-text-muted"
                        title="Details"
                      >
                        <Eye className="w-3 h-3" />
                      </button>
                    </td>
                  </tr>

                  {/* Expanded Detail Row */}
                  {expandedId === pos.id && (
                    <tr className="border-b border-terminal-border bg-terminal-surface/50">
                      <td colSpan={15} className="px-4 py-3">
                        <TradeDetail position={pos} />
                      </td>
                    </tr>
                  )}
                </React.Fragment>
                );
              })
            )}
          </tbody>
        </table>
      </div>
    </div>
  );
}

function TradeDetail({ position }: { position: Position }) {
  const entry = position.analytics?.entrySnapshot as Record<string, unknown> | undefined;
  const signal = position.analytics?.signalSnapshot as Record<string, unknown> | undefined;
  const strength = signal?.strengthBreakdown as Record<string, unknown> | undefined;
  const signalIndicators = signal?.indicators as Record<string, unknown> | undefined;
  const wave = position.analytics?.previousWave as Record<string, unknown> | undefined;
  const exit = position.analytics?.exitSnapshot as Record<string, unknown> | null | undefined;
  const ema = exit?.emaSnapshot as { timeframe?: string; timestamp?: number | null; values?: Record<string, number | null>; unavailableReason?: string } | undefined;
  const asText = (value: unknown, digits = 6) => typeof value === 'number' ? value.toFixed(digits) : typeof value === 'string' ? value : '—';
  return (
    <div className="grid grid-cols-2 gap-4 text-xxs md:grid-cols-4">
      <div>
        <h4 className="font-medium text-terminal-text mb-1">Entry Details</h4>
        <DetailRow label="Entry Time" value={formatTimestamp(position.entryTime)} />
        <DetailRow label="Entry Price" value={formatPrice(position.entryPrice)} />
        <DetailRow label="Entry Notional" value={formatUSDT(position.entryNotional)} />
        <DetailRow label="Entry Fee" value={formatUSDT(position.entryFee, 6)} />
        <DetailRow label="Leverage" value={`${position.leverage}x`} />
      </div>
      <div>
        <h4 className="font-medium text-terminal-text mb-1">Exit Details</h4>
        <DetailRow label="Exit Time" value={formatTimestamp(position.exitTime)} />
        <DetailRow label="Exit Price" value={position.exitPrice ? formatPrice(position.exitPrice) : '—'} />
        <DetailRow label="Exit Notional" value={position.exitNotional ? formatUSDT(position.exitNotional) : '—'} />
        <DetailRow label="Exit Fee" value={position.exitFee ? formatUSDT(position.exitFee, 6) : '—'} />
        <DetailRow label="Exit Reason" value={position.exitReason || '—'} />
      </div>
      <div>
        <h4 className="font-medium text-terminal-text mb-1">PnL Breakdown</h4>
        <DetailRow label="Gross PnL" value={position.realizedGrossPnl ? formatUSDT(position.realizedGrossPnl, 6) : '—'} />
        <DetailRow label="Total Fees" value={formatUSDT(position.totalFees, 6)} />
        <DetailRow label="Funding" value={formatUSDT(position.fundingPaid, 6)} />
        <DetailRow label="Net PnL" value={position.netPnl ? formatUSDT(position.netPnl, 6) : '—'} />
      </div>
      <div>
        <h4 className="font-medium text-terminal-text mb-1">Position Info</h4>
        <DetailRow label="Trade ID" value={position.id.substring(0, 8)} />
        <DetailRow label="Quantity" value={formatQuantity(position.quantity, 6)} />
        <DetailRow label="Margin" value={formatUSDT(position.margin)} />
        <DetailRow label="Stop Loss" value={formatPrice(position.stopLoss)} />
        <DetailRow label="Take Profit" value={formatPrice(position.takeProfit)} />
        <DetailRow label="Initial risk budget" value={formatUSDT(position.initialRiskBudget)} />
        <DetailRow label="Target RR" value={`1:${position.riskRewardRatio}`} />
      </div>
      <div>
        <h4 className="font-medium text-terminal-text mb-1">Signal quality</h4>
        <DetailRow label="Strength" value={`${asText(signal?.strengthScore, 0)}/100 · ${asText(signal?.strengthLabel, 12)}`} />
        <DetailRow label="EMA / MACD / wave" value={`${asText(strength?.emaAlignment, 0)}/25 · ${asText(strength?.macdMomentum, 0)}/25 · ${asText(strength?.waveContext, 0)}/20`} />
        <DetailRow label="RSI / volume / SL" value={`${asText(strength?.rsi, 0)}/10 · ${asText(strength?.volume, 0)}/10 · ${asText(strength?.stopQuality, 0)}/10`} />
        <DetailRow label="Wave comparison" value={asText(strength?.waveComparison, 12)} />
        <DetailRow label="Previous MACD extreme" value={`${asText(strength?.previousMacdExtreme)} · prior ${asText(strength?.priorMacdExtreme)}`} />
        <DetailRow label="Entry EMA 34 / 89" value={`${asText(signalIndicators?.ema34)} / ${asText(signalIndicators?.ema89)}`} />
        <DetailRow label="Entry EMA 200 / 610" value={`${asText(signalIndicators?.ema200)} / ${asText(signalIndicators?.ema610)}`} />
      </div>
      <div>
        <h4 className="font-medium text-terminal-text mb-1">Previous same-direction MACD wave</h4>
        <DetailRow label="Status" value={asText(wave?.status, 12)} />
        <DetailRow label="Wave time" value={`${asText(wave?.startTime)} → ${asText(wave?.endTime)}`} />
        <DetailRow label="MACD max / min" value={`${asText(wave?.maxMacdLine)} / ${asText(wave?.minMacdLine)}`} />
        <DetailRow label="Histogram max / min" value={`${asText(wave?.maxHistogram)} / ${asText(wave?.minHistogram)}`} />
        <DetailRow label="Price high / low" value={`${asText(wave?.highestPrice)} / ${asText(wave?.lowestPrice)}`} />
        <DetailRow label="Peak / trough time" value={`${asText(wave?.highestPriceTime)} / ${asText(wave?.lowestPriceTime)}`} />
      </div>
      <div>
        <h4 className="font-medium text-terminal-text mb-1">Exit snapshot · EMA on completed candle</h4>
        <DetailRow label="Timeframe / timestamp" value={`${ema?.timeframe ?? '—'} · ${ema?.timestamp ? formatTimestamp(ema.timestamp) : '—'}`} />
        <DetailRow label="EMA 34" value={asText(ema?.values?.ema34)} />
        <DetailRow label="EMA 89" value={asText(ema?.values?.ema89)} />
        <DetailRow label="EMA 200" value={asText(ema?.values?.ema200)} />
        <DetailRow label="EMA 610" value={asText(ema?.values?.ema610)} />
        {ema?.unavailableReason && <div className="mt-1 text-terminal-warning">{ema.unavailableReason}</div>}
      </div>
      <div>
        <h4 className="font-medium text-terminal-text mb-1">Exit analytics</h4>
        <DetailRow label="Exit trigger / fill" value={`${asText(exit?.exitReferencePrice)} / ${asText(exit?.actualExitFillPrice)}`} />
        <DetailRow label="Gross R" value={asText(exit?.grossR)} />
        <DetailRow label="Net R" value={asText(exit?.netR)} />
        <DetailRow label="EMA snapshot status" value={ema?.timestamp ? 'Captured at exit' : 'Unavailable'} />
        <DetailRow label="Signal reference" value={asText((position.analytics?.signalSnapshot as Record<string, unknown> | undefined)?.referencePrice)} />
        <DetailRow label="Entry fill" value={asText(entry?.entryFillPrice)} />
      </div>
    </div>
  );
}

function DetailRow({ label, value }: { label: string; value: string }) {
  return (
    <div className="flex justify-between py-0.5">
      <span className="text-terminal-text-muted">{label}</span>
      <span className="text-terminal-text-secondary font-mono font-tabular">{value}</span>
    </div>
  );
}

async function handleClosePosition(positionId: string) {
  if (!confirm('Are you sure you want to close this position?')) return;

  try {
    const res = await fetch('/api/positions', {
      method: 'POST',
      headers: { 'Content-Type': 'application/json' },
      body: JSON.stringify({ positionId, reason: 'MANUAL' }),
    });
    const data = await res.json();
    if (!data.success) {
      alert(`Failed to close position: ${data.error}`);
    }
  } catch (error) {
    alert('Failed to close position');
  }
}
