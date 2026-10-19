'use client';

import { useCallback, useEffect, useState } from 'react';
import { Bell, Check, X, ArrowUpRight, ArrowDownRight, Loader2 } from 'lucide-react';
import { toast } from 'sonner';
import { SIGNAL_STRENGTH_AUTO_ENTRY_THRESHOLD, type AccountState, type NotificationRecord, type TradingConfig } from '@/shared/types';
import { formatPrice, formatUSDT, formatTimestamp } from '@/lib/utils';

type Props = {
  notifications: NotificationRecord[];
  account: AccountState | null;
  prices: Record<string, number>;
  config: TradingConfig | null;
};

export function NotificationCenter({ notifications, account, prices, config }: Props) {
  const [open, setOpen] = useState(false);
  const [selected, setSelected] = useState<NotificationRecord | null>(null);
  const [busyId, setBusyId] = useState<string | null>(null);
  const [now, setNow] = useState(0);
  const unread = notifications.filter(item => !item.readAt).length;
  const liveSelected = notifications.find(item => item.signalId === selected?.signalId) ?? selected;

  useEffect(() => {
    const syncNow = () => setNow(Date.now());
    const initialTimer = window.setTimeout(syncNow, 0);
    const timer = window.setInterval(syncNow, 1000);
    return () => {
      window.clearTimeout(initialTimer);
      window.clearInterval(timer);
    };
  }, []);

  useEffect(() => {
    if (!open) return;
    const closeOnEscape = (event: KeyboardEvent) => { if (event.key === 'Escape') { setOpen(false); setSelected(null); } };
    window.addEventListener('keydown', closeOnEscape);
    return () => window.removeEventListener('keydown', closeOnEscape);
  }, [open]);

  const send = useCallback(async (payload: Record<string, string>) => {
    const response = await fetch('/api/notifications', { method: 'POST', headers: { 'Content-Type': 'application/json' }, body: JSON.stringify(payload) });
    const data = await response.json();
    if (!response.ok || !data.success) throw new Error(data.rejectReason || data.error || 'Action failed');
    return data;
  }, []);

  const selectNotification = useCallback(async (item: NotificationRecord) => {
    setSelected(item);
    if (!item.readAt) {
      try { await send({ action: 'read', notificationId: item.id }); } catch { toast.error('Could not mark notification as read'); }
    }
  }, [send]);

  useEffect(() => {
    const handleReviewSignal = (event: Event) => {
      const signalId = (event as CustomEvent<{ signalId?: string }>).detail?.signalId;
      const item = notifications.find(notification => notification.signalId === signalId);
      if (!item) return;
      setOpen(true);
      void selectNotification(item);
    };
    window.addEventListener('notification:review', handleReviewSignal);
    return () => window.removeEventListener('notification:review', handleReviewSignal);
  }, [notifications, selectNotification]);

  const actionable = liveSelected?.signal.result === 'ACTIONABLE'
    || (liveSelected?.signal.result === 'REJECTED'
      && liveSelected.signal.rejectReason?.startsWith('Insufficient balance') === true
      && now > 0
      && now < liveSelected.signal.expiresAt);
  const autoOpened = liveSelected?.signal.result === 'CONFIRMED' && Boolean(liveSelected.signal.tradeId);
  const side = liveSelected?.signal.action === 'ENTRY_LONG' ? 'LONG' : 'SHORT';
  const price = liveSelected ? (prices[liveSelected.signal.symbol] ?? liveSelected.signal.entryPrice ?? 0) : 0;
  const riskPercent = config?.riskPercent ?? 1;
  const riskRewardRatio = config?.riskRewardRatio ?? 1.2;
  const takerFee = config?.takerFee ?? 0.001;
  const leverage = Math.max(1, config?.leverage ?? 125);
  const slippage = config?.slippage ?? 0.0005;
  const stopLoss = liveSelected?.signal.stopLoss ?? 0;
  const estimatedEntry = price * (side === 'LONG' ? 1 + slippage : 1 - slippage);
  const stopDistance = stopLoss > 0 ? Math.abs(estimatedEntry - stopLoss) : 0;
  const riskBudget = account ? account.balance * riskPercent / 100 : 0;
  const feesPerUnit = stopLoss > 0 ? (estimatedEntry + stopLoss) * takerFee : 0;
  const riskPerUnit = stopDistance + feesPerUnit;
  const balancePerUnit = estimatedEntry / leverage + feesPerUnit;
  const riskLimitedQuantity = riskPerUnit > 0 ? riskBudget / riskPerUnit : 0;
  const balanceLimitedQuantity = balancePerUnit > 0 ? (account?.availableBalance ?? 0) / balancePerUnit : 0;
  const estimatedQuantity = Math.max(0, Math.min(riskLimitedQuantity, balanceLimitedQuantity));
  const estimatedFees = estimatedQuantity * feesPerUnit;
  const estimatedMarginAndFees = estimatedQuantity * estimatedEntry / leverage + estimatedFees;

  const confirm = async () => {
    if (!liveSelected) return;
    setBusyId(liveSelected.signalId);
    try {
      await send({ action: 'confirm-entry', signalId: liveSelected.signalId });
      toast.success(`Paper ${side} position opened`);
      setSelected(null);
    } catch (error) {
      toast.error(error instanceof Error ? error.message : 'Could not confirm signal');
    } finally { setBusyId(null); }
  };

  const dismiss = async () => {
    if (!liveSelected) return;
    try {
      await send({ action: 'dismiss', notificationId: liveSelected.id });
      toast.success('Signal dismissed');
      setSelected(null);
    } catch (error) { toast.error(error instanceof Error ? error.message : 'Could not dismiss signal'); }
  };

  return (
    <div className="relative">
      <button aria-label={`Notifications, ${unread} unread`} onClick={() => setOpen(value => !value)} className="relative rounded p-2 text-terminal-text-secondary hover:bg-terminal-border hover:text-terminal-text">
        <Bell className="h-4 w-4" />
        {unread > 0 && <span className="absolute -right-0.5 -top-0.5 min-w-4 rounded-full bg-terminal-short px-1 text-center text-[9px] leading-4 text-white">{unread > 99 ? '99+' : unread}</span>}
      </button>
      {open && <>
        <button aria-label="Close notifications" className="fixed inset-0 z-40 cursor-default" onClick={() => { setOpen(false); setSelected(null); }} />
        <section className="absolute right-0 top-full z-50 mt-2 w-[min(420px,calc(100vw-24px))] overflow-hidden rounded-md border border-terminal-border bg-terminal-surface shadow-2xl">
          <header className="flex items-center justify-between border-b border-terminal-border px-3 py-2">
            <div><h2 className="text-xs font-semibold text-terminal-text">Signal notifications</h2><p className="text-[10px] text-terminal-text-muted">{unread} unread · monitoring continues while this panel is closed</p></div>
            <div className="flex items-center gap-2"><button className="text-[10px] text-terminal-accent hover:underline" onClick={() => void send({ action: 'mark-all-read' }).catch(() => toast.error('Could not update notifications'))}>Mark all read</button><button aria-label="Close" onClick={() => setOpen(false)} className="rounded p-1 hover:bg-terminal-border"><X className="h-3.5 w-3.5" /></button></div>
          </header>
          <div className="max-h-[55vh] overflow-y-auto">
            {notifications.length === 0 ? <p className="px-4 py-10 text-center text-xs text-terminal-text-muted">No signals yet. Start monitoring to receive intrabar alerts.</p> : notifications.map(item => {
              const long = item.signal.action === 'ENTRY_LONG';
              return <button key={item.id} onClick={() => void selectNotification(item)} className={`block w-full border-b border-terminal-border px-3 py-2.5 text-left hover:bg-terminal-bg/70 ${!item.readAt ? 'bg-terminal-bg/40' : ''}`}>
                <div className="flex items-start gap-2">
                  <span className={`mt-0.5 rounded p-1 ${long ? 'bg-terminal-long/10 text-terminal-long' : 'bg-terminal-short/10 text-terminal-short'}`}>{long ? <ArrowUpRight className="h-3.5 w-3.5" /> : <ArrowDownRight className="h-3.5 w-3.5" />}</span>
                  <span className="min-w-0 flex-1"><span className="flex items-center justify-between"><strong className="text-xs text-terminal-text">{item.signal.symbol} · {long ? 'LONG' : 'SHORT'} · {item.signal.timeframe}</strong><span className="text-[9px] text-terminal-text-muted">{formatTimestamp(item.createdAt)}</span></span>
                    <span className="mt-1 block text-[10px] text-terminal-text-secondary">{long ? 'Previous completed histogram ≤ 0; current provisional histogram crossed above 0.' : 'Previous completed histogram ≥ 0; current provisional histogram crossed below 0.'}</span>
                    <span className="mt-1 block font-mono text-[10px] text-terminal-text-muted">Signal {formatPrice(item.signal.entryPrice)} · MACD {item.signal.macdLine.toPrecision(5)} · Signal {item.signal.macdSignal.toPrecision(5)} · Hist {item.signal.macdHistogram.toPrecision(5)}</span>
                    <span className="mt-1 block text-[10px] font-semibold text-terminal-accent">Signal strength {item.signal.strengthScore}/100 · {item.signal.strengthLabel}</span>
                    <span className="mt-1 inline-flex rounded bg-terminal-border px-1.5 py-0.5 text-[9px] uppercase tracking-wide text-terminal-text-secondary">{item.signal.result}{item.signal.tradeId ? ' · AUTO PAPER' : ''}</span>
                    {item.signal.rejectReason && <span className="mt-1 block text-[10px] text-terminal-warning">{item.signal.rejectReason}</span>}
                  </span>
                </div>
              </button>;
            })}
          </div>
        </section>
      </>}
      {open && liveSelected && <div className="fixed inset-0 z-[60] flex items-center justify-center bg-black/70 p-4" onMouseDown={event => { if (event.target === event.currentTarget) setSelected(null); }}>
        <section role="dialog" aria-modal="true" aria-labelledby="confirm-signal-title" className="w-full max-w-lg rounded-md border border-terminal-border bg-terminal-surface shadow-2xl">
          <header className="flex items-start justify-between border-b border-terminal-border px-4 py-3"><div><h2 id="confirm-signal-title" className="text-sm font-semibold text-terminal-text">{autoOpened ? 'Automatic paper entry' : 'Signal details'}</h2><p className="mt-0.5 text-[10px] text-terminal-text-muted">{autoOpened ? `Paper position opened automatically at strength ${liveSelected.signal.strengthScore}/100.` : `Auto-entry threshold: ${SIGNAL_STRENGTH_AUTO_ENTRY_THRESHOLD}/100. This paper terminal does not place Binance orders.`}</p></div><button aria-label="Close signal details" onClick={() => setSelected(null)} className="rounded p-1 hover:bg-terminal-border"><X className="h-4 w-4" /></button></header>
          <div className="grid grid-cols-2 gap-x-6 gap-y-3 px-4 py-4 text-xs">
            <Review label="Signal" value={`${liveSelected.signal.symbol} ${side} · ${liveSelected.signal.timeframe}`} />
            <Review label="Signal strength" value={`${liveSelected.signal.strengthScore}/100 · ${liveSelected.signal.strengthLabel}`} />
            <Review label="Score breakdown" value={`EMA ${liveSelected.signal.strengthBreakdown.emaAlignment}/25 · MACD ${liveSelected.signal.strengthBreakdown.macdMomentum}/25 · Wave ${liveSelected.signal.strengthBreakdown.waveContext}/20 · RSI ${liveSelected.signal.strengthBreakdown.rsi}/10 · Volume ${liveSelected.signal.strengthBreakdown.volume}/10 · SL ${liveSelected.signal.strengthBreakdown.stopQuality}/10`} />
            <Review label="Detected" value={formatTimestamp(liveSelected.signal.createdAt)} />
            <Review label="Signal reference" value={formatPrice(liveSelected.signal.entryPrice)} />
            <Review label="Latest mark price" value={formatPrice(price)} />
            <Review label="MACD / Signal" value={`${liveSelected.signal.macdLine.toPrecision(6)} / ${liveSelected.signal.macdSignal.toPrecision(6)}`} />
            <Review label="Histogram (previous → live)" value={`${liveSelected.signal.prevHistogram.toPrecision(6)} → ${liveSelected.signal.macdHistogram.toPrecision(6)}`} />
            <Review label="Stop Loss" value={formatPrice(liveSelected.signal.stopLoss)} />
            <Review label={`Take Profit · 1:${riskRewardRatio}`} value={formatPrice(liveSelected.signal.takeProfit ?? (side === 'LONG' ? price + riskRewardRatio * (price - (liveSelected.signal.stopLoss ?? price)) : price - riskRewardRatio * ((liveSelected.signal.stopLoss ?? price) - price)))} />
            <Review label={`Risk budget · ${riskPercent}% balance`} value={formatUSDT(riskBudget)} />
            <Review label="Available balance" value={formatUSDT(account?.availableBalance)} />
            <Review label="Estimated quantity · balance capped" value={estimatedQuantity.toPrecision(6)} />
            <Review label="Estimated margin + fees" value={formatUSDT(estimatedMarginAndFees, 5)} />
            <Review label="Estimated entry + exit fees" value={formatUSDT(estimatedFees, 5)} />
            <Review label="Open positions" value={`${account?.openPositionsCount ?? '—'} / ${account?.maxPositions ?? 10}`} />
          </div>
          <p className="mx-4 rounded border border-terminal-warning/30 bg-terminal-warning/5 px-3 py-2 text-[10px] text-terminal-warning">{liveSelected.signal.rejectReason ? `Signal status: ${liveSelected.signal.rejectReason}.` : autoOpened ? 'The position was sized to the risk and available balance limits. Stop loss and take profit are monitored by the paper engine.' : 'The engine checks score, expiry, market freshness, one-position-per-symbol, the 10-position cap, risk, margin, and exchange filters before an automatic paper fill.'}</p>
          <footer className="flex justify-end gap-2 px-4 py-3">{actionable && <button disabled={!actionable} onClick={() => void dismiss()} className="mr-auto rounded px-2 py-1.5 text-xs text-terminal-short hover:bg-terminal-short/10 disabled:opacity-40">Dismiss signal</button>}<button onClick={() => setSelected(null)} className="rounded border border-terminal-border px-3 py-1.5 text-xs text-terminal-text-secondary hover:bg-terminal-border">Close</button>{actionable && <button disabled={now === 0 || busyId === liveSelected.signalId || now >= liveSelected.signal.expiresAt} onClick={() => void confirm()} className="inline-flex items-center gap-1.5 rounded bg-terminal-accent px-3 py-1.5 text-xs font-medium text-white disabled:cursor-not-allowed disabled:opacity-40">{busyId === liveSelected.signalId && <Loader2 className="h-3 w-3 animate-spin" />}<Check className="h-3 w-3" />Open paper order</button>}</footer>
        </section>
      </div>}
    </div>
  );
}

function Review({ label, value }: { label: string; value: string }) {
  return <div><div className="text-[10px] text-terminal-text-muted">{label}</div><div className="mt-0.5 font-mono text-xs text-terminal-text">{value}</div></div>;
}
