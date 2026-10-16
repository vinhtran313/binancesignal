/**
 * Global Header - Account metrics, connection status, engine status
 */
'use client';

import React from 'react';
import { cn, formatUSDT, formatPercent, pnlColor } from '@/lib/utils';
import type { AccountState, StrategyState, ConnectionStatus, Position, TradingConfig } from '@/shared/types';
import type { NotificationRecord } from '@/shared/types';
import { NotificationCenter } from '@/features/notifications/notification-center';
import {
  Activity,
  Wifi,
  WifiOff,
  Settings,
  BarChart3,
  TrendingUp,
  TrendingDown,
  CircleDot,
} from 'lucide-react';

interface HeaderProps {
  account: AccountState | null;
  strategy: StrategyState | null;
  connection: ConnectionStatus;
  isConnected: boolean;
  positions: Position[];
  onOpenStrategy: () => void;
  notifications: NotificationRecord[];
  markPrices: Record<string, number>;
  lastPrices: Record<string, number>;
  config: TradingConfig | null;
}

export function Header({
  account,
  strategy,
  connection,
  isConnected,
  positions,
  onOpenStrategy,
  notifications,
  markPrices,
  lastPrices,
  config,
}: HeaderProps) {
  const openCount = positions.filter(p => p.status === 'OPEN').length;

  return (
    <header className="flex items-center h-12 px-4 border-b border-terminal-border bg-terminal-surface no-select">
      {/* Logo / Identity */}
      <div className="flex items-center gap-2 mr-6">
        <BarChart3 className="w-5 h-5 text-terminal-accent" />
        <span className="text-sm font-semibold tracking-wide text-terminal-text">
          FUTURES TERMINAL
        </span>
        <span className="text-xxs text-terminal-text-muted px-1.5 py-0.5 rounded bg-terminal-border">
          PAPER
        </span>
      </div>

      {/* Connection Status */}
      <div className="flex items-center gap-1.5 mr-4">
        {connection === 'CONNECTED' ? (
          <Wifi className="w-3.5 h-3.5 text-terminal-long" />
        ) : connection === 'CONNECTING' || connection === 'RECONNECTING' ? (
          <Wifi className="w-3.5 h-3.5 text-terminal-warning animate-pulse" />
        ) : (
          <WifiOff className="w-3.5 h-3.5 text-terminal-short" />
        )}
        <span className={cn(
          'text-xxs font-mono',
          connection === 'CONNECTED' ? 'text-terminal-long' :
          connection === 'CONNECTING' || connection === 'RECONNECTING' ? 'text-terminal-warning' :
          'text-terminal-short'
        )}>
          {connection}
        </span>
      </div>

      {/* Strategy Status */}
      <div className="flex items-center gap-1.5 mr-6">
        <CircleDot className={cn(
          'w-3.5 h-3.5',
          strategy?.status === 'RUNNING' ? 'text-terminal-long' :
          strategy?.status === 'PAUSED' ? 'text-terminal-warning' :
          'text-terminal-text-muted'
        )} />
        <span className={cn(
          'text-xxs font-mono',
          strategy?.status === 'RUNNING' ? 'text-terminal-long' :
          strategy?.status === 'PAUSED' ? 'text-terminal-warning' :
          'text-terminal-text-muted'
        )}>
          {strategy?.status || 'IDLE'}
        </span>
      </div>

      {/* Separator */}
      <div className="w-px h-6 bg-terminal-border mr-4" />

      {/* Account Metrics */}
      <div className="flex items-center gap-5 flex-1">
        <MetricItem label="Initial" value={formatUSDT(account?.initialBalance)} />
        <MetricItem
          label="Balance"
          value={formatUSDT(account?.balance)}
        />
        <MetricItem
          label="Equity"
          value={formatUSDT(account?.equity)}
          highlight
        />
        <MetricItem
          label="Available"
          value={formatUSDT(account?.availableBalance)}
        />
        <MetricItem
          label="Realized PnL"
          value={formatUSDT(account?.realizedPnl)}
          valueClass={pnlColor(account?.realizedPnl)}
        />
        <MetricItem
          label="Unrealized PnL"
          value={formatUSDT(account?.unrealizedPnl)}
          valueClass={pnlColor(account?.unrealizedPnl)}
        />
        <MetricItem
          label="Positions"
          value={`${openCount}/${account?.maxPositions || 10}`}
        />
        <MetricItem label="15m Equity" value={account?.snapshotChangePercent == null ? 'N/A' : formatPercent(account.snapshotChangePercent)} valueClass={pnlColor(account?.snapshotChangePercent)} />
      </div>

      <div className="mr-2"><NotificationCenter notifications={notifications} account={account} prices={config?.triggerPriceModel === 'LAST_PRICE' ? lastPrices : markPrices} config={config} /></div>

      {/* Strategy Button */}
      <button
        onClick={onOpenStrategy}
        className="flex items-center gap-1.5 px-3 py-1.5 rounded text-xs font-medium
                   bg-terminal-border hover:bg-terminal-muted text-terminal-text
                   transition-colors"
        title="Strategy Settings"
      >
        <Settings className="w-3.5 h-3.5" />
        Strategy
      </button>
    </header>
  );
}

function MetricItem({
  label,
  value,
  valueClass,
  highlight,
}: {
  label: string;
  value: string;
  valueClass?: string;
  highlight?: boolean;
}) {
  return (
    <div className="flex flex-col gap-0">
      <span className="text-xxs text-terminal-text-muted leading-none">{label}</span>
      <span
        className={cn(
          'text-xs font-mono font-tabular leading-tight',
          valueClass || (highlight ? 'text-terminal-text' : 'text-terminal-text-secondary')
        )}
      >
        {value}
      </span>
    </div>
  );
}
