/**
 * Chart Workspace - TradingView Lightweight Charts with indicators
 */
'use client';

import React, { useState, useEffect, useMemo, useRef } from 'react';
import { useMarketData } from '@/hooks/use-market-data';
import type { LiveCandleUpdate } from '@/hooks/use-engine-stream';
import { cn, formatPrice, formatPercent } from '@/lib/utils';
import type { Timeframe, Position, Candle, NotificationRecord } from '@/shared/types';
import { TIMEFRAMES } from '@/shared/types';
import { Search, ChevronDown, Loader2 } from 'lucide-react';
import { calculateAllIndicators } from '@/server/indicators';

interface ChartWorkspaceProps {
  symbol: string;
  timeframe: Timeframe;
  onSymbolChange: (symbol: string) => void;
  onTimeframeChange: (tf: Timeframe) => void;
  positions: Position[];
  liveCandle?: LiveCandleUpdate | null;
  notifications: NotificationRecord[];
}

export function ChartWorkspace({
  symbol,
  timeframe,
  onSymbolChange,
  onTimeframeChange,
  positions,
  liveCandle,
  notifications,
}: ChartWorkspaceProps) {
  const { candles, indicators, markPrice, loading, error } = useMarketData(symbol, timeframe);
  const [showSymbolSearch, setShowSymbolSearch] = useState(false);
  const [availableSymbols, setAvailableSymbols] = useState<string[]>([]);
  const [searchQuery, setSearchQuery] = useState('');

  // Fetch available symbols
  useEffect(() => {
    fetch('/api/symbols')
      .then(res => res.json())
      .then(data => {
        if (data.success) {
          setAvailableSymbols(data.data.map((s: any) => s.symbol));
        }
      })
      .catch(() => {});
  }, []);

  const filteredSymbols = availableSymbols.filter(s =>
    s.toLowerCase().includes(searchQuery.toLowerCase())
  );

  // Calculate price change
  const livePrice = liveCandle?.symbol === symbol && liveCandle.candle?.close ? liveCandle.candle.close : null;
  const currentPrice = livePrice ?? (candles.length > 0 ? candles[candles.length - 1]?.close : markPrice);
  const firstClose = candles[0]?.close || 1;
  const priceChange = candles.length >= 2 && currentPrice
    ? ((currentPrice - firstClose) / firstClose) * 100
    : 0;

  return (
    <div className="flex flex-col border-b border-terminal-border">
      {/* Chart Toolbar */}
      <div className="flex items-center gap-2 h-10 px-3 border-b border-terminal-border bg-terminal-surface">
        {/* Symbol Selector */}
        <div className="relative">
          <button
            onClick={() => setShowSymbolSearch(!showSymbolSearch)}
            className="flex items-center gap-1.5 px-2 py-1 rounded text-sm font-semibold
                       hover:bg-terminal-border transition-colors"
          >
            <span className="text-terminal-text">{symbol.replace('USDT', '')}</span>
            <span className="text-terminal-text-muted text-xs">/USDT</span>
            <ChevronDown className="w-3.5 h-3.5 text-terminal-text-muted" />
          </button>

          {showSymbolSearch && (
            <div className="absolute top-full left-0 mt-1 z-50 w-64 bg-terminal-surface
                            border border-terminal-border rounded-md shadow-lg">
              <div className="p-2 border-b border-terminal-border">
                <div className="relative">
                  <Search className="absolute left-2 top-1/2 -translate-y-1/2 w-3.5 h-3.5 text-terminal-text-muted" />
                  <input
                    type="text"
                    placeholder="Search symbol..."
                    value={searchQuery}
                    onChange={e => setSearchQuery(e.target.value)}
                    className="w-full pl-7 pr-2 py-1.5 text-xs bg-terminal-bg border border-terminal-border
                               rounded text-terminal-text placeholder-terminal-text-muted
                               focus:outline-none focus:border-terminal-accent"
                    autoFocus
                  />
                </div>
              </div>
              <div className="max-h-48 overflow-y-auto">
                {filteredSymbols.map(s => (
                  <button
                    key={s}
                    onClick={() => {
                      onSymbolChange(s);
                      setShowSymbolSearch(false);
                      setSearchQuery('');
                    }}
                    className={cn(
                      'w-full text-left px-3 py-1.5 text-xs hover:bg-terminal-border transition-colors',
                      s === symbol ? 'bg-terminal-border text-terminal-text' : 'text-terminal-text-secondary'
                    )}
                  >
                    {s.replace('USDT', '')}
                    <span className="text-terminal-text-muted">/USDT</span>
                  </button>
                ))}
                {filteredSymbols.length === 0 && (
                  <div className="px-3 py-4 text-xs text-terminal-text-muted text-center">
                    No symbols found
                  </div>
                )}
              </div>
            </div>
          )}
        </div>

        {/* Current Price */}
        <div className="flex items-center gap-2 ml-2">
          <span className="text-lg font-mono font-semibold text-terminal-text font-tabular">
            {formatPrice(currentPrice)}
          </span>
          <span className={cn(
            'text-xs font-mono font-tabular',
            priceChange >= 0 ? 'text-terminal-long' : 'text-terminal-short'
          )}>
            {formatPercent(priceChange)}
          </span>
        </div>

        {/* Separator */}
        <div className="w-px h-5 bg-terminal-border mx-2" />

        {/* Timeframe Selector */}
        <div className="flex items-center gap-0.5">
          {TIMEFRAMES.map(tf => (
            <button
              key={tf}
              onClick={() => onTimeframeChange(tf)}
              className={cn(
                'px-2 py-1 text-xs rounded transition-colors',
                tf === timeframe
                  ? 'bg-terminal-accent text-white'
                  : 'text-terminal-text-secondary hover:text-terminal-text hover:bg-terminal-border'
              )}
            >
              {tf.toUpperCase()}
            </button>
          ))}
        </div>
      </div>

      {/* Chart Area */}
      <div className="relative" style={{ height: 'calc(100vh - 200px)', minHeight: '500px' }}>
        {loading && candles.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <Loader2 className="w-8 h-8 text-terminal-accent animate-spin" />
              <span className="text-sm text-terminal-text-secondary">Loading market data...</span>
            </div>
          </div>
        ) : error && candles.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <span className="text-sm text-terminal-short">Failed to load market data</span>
              <span className="text-xs text-terminal-text-muted">{error}</span>
              <span className="text-xs text-terminal-text-muted">
                Make sure the engine is running and Binance API is accessible.
              </span>
            </div>
          </div>
        ) : candles.length === 0 ? (
          <div className="flex items-center justify-center h-full">
            <div className="flex flex-col items-center gap-3">
              <span className="text-sm text-terminal-text-secondary">No candle data available</span>
              <span className="text-xs text-terminal-text-muted">
                Start the engine to begin receiving market data.
              </span>
            </div>
          </div>
        ) : (
          <ChartRenderer
            key={`${symbol}:${timeframe}`}
            candles={candles}
            indicators={indicators}
            positions={positions.filter(p => p.symbol === symbol)}
            symbol={symbol}
            timeframe={timeframe}
            liveCandle={liveCandle}
            notifications={notifications}
          />
        )}
      </div>
    </div>
  );
}

/**
 * Chart Renderer using TradingView Lightweight Charts
 */
function ChartRenderer({
  candles,
  indicators,
  positions,
  symbol,
  timeframe,
  liveCandle,
  notifications,
}: {
  candles: Candle[];
  indicators: import('@/shared/types').IndicatorSeries | null;
  positions: Position[];
  symbol: string;
  timeframe: Timeframe;
  liveCandle?: LiveCandleUpdate | null;
  notifications: import('@/shared/types').NotificationRecord[];
}) {
  const paneRefs = useRef<Record<string, HTMLDivElement | null>>({});
  const chartRefs = useRef<Record<string, any>>({});
  const seriesRefs = useRef<Record<string, any>>({});
  const priceLineRefs = useRef<any[]>([]);
  const renderedDataRef = useRef<{ candles: Candle[]; indicators: import('@/shared/types').IndicatorSeries | null } | null>(null);
  const [chartReady, setChartReady] = useState(false);
  const live = liveCandle?.symbol === symbol && liveCandle.timeframe === timeframe ? liveCandle.candle : null;
  const chartCandles = candles;
  const chartIndicators = indicators;
  const provisionalIndicators = useMemo(() => {
    if (!live) return null;
    const rows = [...candles];
    const index = rows.findIndex(candle => candle.openTime === live.openTime);
    if (index >= 0) rows[index] = live;
    else rows.push(live);
    return calculateAllIndicators(rows);
  }, [candles, live]);

  useEffect(() => {
    if (!chartCandles.length || !paneRefs.current.price || !paneRefs.current.volume || !paneRefs.current.rsi || !paneRefs.current.macd) return;
    let disposed = false;
    let resizeObserver: ResizeObserver | null = null;
    const charts: Record<string, any> = {};
    const series: Record<string, any> = {};
    const syncState = { time: false, crosshair: false };

    const initialize = async () => {
      const { createChart, ColorType, CrosshairMode, LineStyle } = await import('lightweight-charts');
      if (disposed) return;
      const paneConfig = (height: number, showTimeAxis: boolean) => ({
        width: paneRefs.current.price?.clientWidth ?? 0,
        height,
        layout: { background: { type: ColorType.Solid, color: '#0f1118' }, textColor: '#8b93a7', fontSize: 10, fontFamily: 'JetBrains Mono, monospace' },
        grid: { vertLines: { color: 'rgba(30, 34, 49, 0.45)' }, horzLines: { color: 'rgba(30, 34, 49, 0.45)' } },
        crosshair: { mode: CrosshairMode.Normal, vertLine: { color: 'rgba(59, 130, 246, 0.35)', width: 1 as const, style: LineStyle.Dotted }, horzLine: { color: 'rgba(59, 130, 246, 0.35)', width: 1 as const, style: LineStyle.Dotted } },
        rightPriceScale: { borderColor: '#1e2231', scaleMargins: { top: 0.08, bottom: 0.08 } },
        timeScale: { borderColor: '#1e2231', timeVisible: true, secondsVisible: false, visible: showTimeAxis, rightOffset: 8, shiftVisibleRangeOnNewBar: true, allowShiftVisibleRangeOnWhitespaceReplacement: true },
        handleScroll: { mouseWheel: true, pressedMouseMove: true },
        handleScale: { mouseWheel: true, pinch: true },
      });
      for (const name of ['price', 'volume', 'rsi', 'macd']) {
        const host = paneRefs.current[name];
        if (!host) continue;
        charts[name] = createChart(host, paneConfig(host.clientHeight, name === 'macd'));
      }
      if (disposed) { Object.values(charts).forEach((chart: any) => chart.remove()); return; }
      const toTime = (time: number) => Math.floor(time / 1000) as any;
      const candleData = chartCandles.map(c => ({ time: toTime(c.openTime), open: c.open, high: c.high, low: c.low, close: c.close }));
      series.price = charts.price.addCandlestickSeries({ upColor: '#22c55e', downColor: '#ef4444', borderUpColor: '#22c55e', borderDownColor: '#ef4444', wickUpColor: '#22c55e', wickDownColor: '#ef4444' });
      series.price.setData(candleData);

      const emaColors: Record<string, string> = { ema34: '#f59e0b', ema89: '#8b5cf6', ema200: '#3b82f6', ema610: '#ec4899' };
      if (chartIndicators) for (const [key, color] of Object.entries(emaColors)) {
        const values = chartIndicators[key as keyof typeof chartIndicators] as (number | null)[];
        const rows = values.flatMap((value, index) => value == null || !chartCandles[index] ? [] : [{ time: toTime(chartCandles[index].openTime), value }]);
        const line = charts.price.addLineSeries({ color, lineWidth: 1, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
        line.setData(rows);
        series[key] = line;
      }

      series.volume = charts.volume.addHistogramSeries({ priceFormat: { type: 'volume' }, priceScaleId: 'right', lastValueVisible: false });
      series.volume.setData(chartCandles.map(c => ({ time: toTime(c.openTime), value: c.volume, color: c.close >= c.open ? 'rgba(34,197,94,.45)' : 'rgba(239,68,68,.45)' })));
      charts.volume.priceScale('right').applyOptions({ scaleMargins: { top: 0.12, bottom: 0 } });

      series.rsi = charts.rsi.addLineSeries({ color: '#38bdf8', lineWidth: 1, lastValueVisible: true, priceLineVisible: false });
      series.rsi.setData((chartIndicators?.rsi14 ?? []).flatMap((value, index) => value == null || !chartCandles[index] ? [] : [{ time: toTime(chartCandles[index].openTime), value }]));
      series.rsiGuides = [];
      for (const level of [30, 50, 70]) {
        const guide = charts.rsi.addLineSeries({ color: '#3a4157', lineWidth: 1, lineStyle: LineStyle.Dotted, lastValueVisible: false, priceLineVisible: false, crosshairMarkerVisible: false });
        guide.setData(chartCandles.length ? [{ time: toTime(chartCandles[0].openTime), value: level }, { time: toTime(chartCandles[chartCandles.length - 1].openTime), value: level }] : []);
        series.rsiGuides.push({ series: guide, level });
      }

      series.macd = charts.macd.addLineSeries({ color: '#60a5fa', lineWidth: 1, lastValueVisible: true, priceLineVisible: false });
      series.macd.setData((chartIndicators?.macdLine ?? []).flatMap((value, index) => value == null || !chartCandles[index] ? [] : [{ time: toTime(chartCandles[index].openTime), value }]));
      series.signal = charts.macd.addLineSeries({ color: '#f59e0b', lineWidth: 1, lastValueVisible: true, priceLineVisible: false });
      series.signal.setData((chartIndicators?.macdSignal ?? []).flatMap((value, index) => value == null || !chartCandles[index] ? [] : [{ time: toTime(chartCandles[index].openTime), value }]));
      series.histogram = charts.macd.addHistogramSeries({ priceScaleId: 'right', lastValueVisible: false });
      series.histogram.setData((chartIndicators?.macdHistogram ?? []).flatMap((value, index) => value == null || !chartCandles[index] ? [] : [{ time: toTime(chartCandles[index].openTime), value, color: value >= 0 ? 'rgba(34,197,94,.75)' : 'rgba(239,68,68,.75)' }]));

      priceLineRefs.current = [];
      const markers: any[] = [];
      for (const position of positions) {
        const entryTime = toTime(position.entryTime);
        markers.push({ time: entryTime, position: position.side === 'LONG' ? 'belowBar' : 'aboveBar', color: position.side === 'LONG' ? '#22c55e' : '#ef4444', shape: position.side === 'LONG' ? 'arrowUp' : 'arrowDown', text: `${position.side} entry` });
        if (position.status === 'CLOSED' && position.exitTime) markers.push({ time: toTime(position.exitTime), position: position.side === 'LONG' ? 'aboveBar' : 'belowBar', color: '#f59e0b', shape: 'circle', text: `${position.exitReason ?? 'EXIT'} fill` });
        if (position.status === 'OPEN') {
          priceLineRefs.current.push(series.price.createPriceLine({ price: position.stopLoss, color: '#ef4444', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'SL' }));
          priceLineRefs.current.push(series.price.createPriceLine({ price: position.takeProfit, color: '#22c55e', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'TP' }));
          priceLineRefs.current.push(series.price.createPriceLine({ price: position.entryPrice, color: '#8b93a7', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `${position.side} entry` }));
        }
      }
      for (const item of notifications.filter(item => item.signal.symbol === symbol)) {
        markers.push({ time: toTime(item.signal.candleOpenTime), position: item.signal.action === 'ENTRY_LONG' ? 'belowBar' : 'aboveBar', color: item.signal.action === 'ENTRY_LONG' ? '#22c55e' : '#ef4444', shape: item.signal.action === 'ENTRY_LONG' ? 'arrowUp' : 'arrowDown', text: `${item.signal.action === 'ENTRY_LONG' ? 'LONG' : 'SHORT'} signal` });
      }
      series.price.setMarkers(markers.sort((a, b) => a.time - b.time));

      for (const chart of Object.values(charts) as any[]) chart.timeScale().fitContent();
      for (const [name, chart] of Object.entries(charts)) {
        chart.timeScale().subscribeVisibleLogicalRangeChange((range: any) => {
          if (syncState.time || !range) return;
          syncState.time = true;
          for (const [peerName, peer] of Object.entries(charts)) if (peerName !== name) (peer as any).timeScale().setVisibleLogicalRange(range);
          syncState.time = false;
        });
        const sourceSeries = series[name];
        chart.subscribeCrosshairMove((param: any) => {
          if (syncState.crosshair) return;
          syncState.crosshair = true;
          for (const [peerName, peer] of Object.entries(charts)) {
            if (peerName === name || !param.time) { if (peerName !== name) (peer as any).clearCrosshairPosition(); continue; }
            const datum = param.seriesData?.get(sourceSeries) as any;
            const price = typeof datum === 'number' ? datum : datum?.close ?? datum?.value;
            if (typeof price === 'number' && price > 0 && series[peerName]) (peer as any).setCrosshairPosition(price, param.time, series[peerName]);
          }
          syncState.crosshair = false;
        });
      }
      chartRefs.current = charts;
      seriesRefs.current = series;
      renderedDataRef.current = { candles: chartCandles, indicators: chartIndicators };
      setChartReady(true);
      resizeObserver = new ResizeObserver(() => {
        for (const [name, chart] of Object.entries(charts)) {
          const host = paneRefs.current[name];
          if (host) (chart as any).applyOptions({ width: host.clientWidth, height: host.clientHeight });
        }
      });
      Object.values(paneRefs.current).forEach(host => { if (host) resizeObserver?.observe(host); });
    };
    void initialize();
    return () => {
      disposed = true;
      resizeObserver?.disconnect();
      Object.values(charts).forEach((chart: any) => chart.remove());
      chartRefs.current = {};
      seriesRefs.current = {};
    };
  }, [symbol, timeframe]);

  useEffect(() => {
    if (!chartReady || !chartCandles.length || !seriesRefs.current.price) return;
    if (renderedDataRef.current?.candles === chartCandles && renderedDataRef.current?.indicators === chartIndicators) return;
    const refs = seriesRefs.current;
    const toTime = (time: number) => Math.floor(time / 1000) as any;
    const oldCandles = renderedDataRef.current?.candles ?? [];
    const priceChart = chartRefs.current.price;
    const logicalRange = priceChart?.timeScale().getVisibleLogicalRange();
    const followingLive = !logicalRange || logicalRange.to >= oldCandles.length - 2;
    const candleData = chartCandles.map(c => ({ time: toTime(c.openTime), open: c.open, high: c.high, low: c.low, close: c.close }));
    refs.price.setData(candleData);
    refs.volume.setData(chartCandles.map(c => ({ time: toTime(c.openTime), value: c.volume, color: c.close >= c.open ? 'rgba(34,197,94,.45)' : 'rgba(239,68,68,.45)' })));
    const emaKeys = ['ema34', 'ema89', 'ema200', 'ema610'] as const;
    for (const key of emaKeys) refs[key]?.setData((chartIndicators?.[key] ?? []).flatMap((value, index) => value == null || !chartCandles[index] ? [] : [{ time: toTime(chartCandles[index].openTime), value }]));
    refs.rsi?.setData((chartIndicators?.rsi14 ?? []).flatMap((value, index) => value == null || !chartCandles[index] ? [] : [{ time: toTime(chartCandles[index].openTime), value }]));
    for (const { series, level } of refs.rsiGuides ?? []) series.setData([{ time: toTime(chartCandles[0].openTime), value: level }, { time: toTime(chartCandles[chartCandles.length - 1].openTime), value: level }]);
    refs.macd?.setData((chartIndicators?.macdLine ?? []).flatMap((value, index) => value == null || !chartCandles[index] ? [] : [{ time: toTime(chartCandles[index].openTime), value }]));
    refs.signal?.setData((chartIndicators?.macdSignal ?? []).flatMap((value, index) => value == null || !chartCandles[index] ? [] : [{ time: toTime(chartCandles[index].openTime), value }]));
    refs.histogram?.setData((chartIndicators?.macdHistogram ?? []).flatMap((value, index) => value == null || !chartCandles[index] ? [] : [{ time: toTime(chartCandles[index].openTime), value, color: value >= 0 ? 'rgba(34,197,94,.75)' : 'rgba(239,68,68,.75)' }]));
    if (followingLive) Object.values(chartRefs.current).forEach((chart: any) => chart.timeScale().scrollToRealTime());
    else if (logicalRange) Object.values(chartRefs.current).forEach((chart: any) => chart.timeScale().setVisibleLogicalRange(logicalRange));
    renderedDataRef.current = { candles: chartCandles, indicators: chartIndicators };
  }, [chartCandles, chartIndicators, chartReady]);

  useEffect(() => {
    if (!chartReady || !seriesRefs.current.price) return;
    let cancelled = false;
    void import('lightweight-charts').then(({ LineStyle }) => {
      if (cancelled || !seriesRefs.current.price) return;
      for (const line of priceLineRefs.current) seriesRefs.current.price.removePriceLine(line);
      priceLineRefs.current = [];
      const markers: any[] = [];
      for (const position of positions) {
        markers.push({ time: Math.floor(position.entryTime / 1000), position: position.side === 'LONG' ? 'belowBar' : 'aboveBar', color: position.side === 'LONG' ? '#22c55e' : '#ef4444', shape: position.side === 'LONG' ? 'arrowUp' : 'arrowDown', text: `${position.side} entry` });
        if (position.status === 'CLOSED' && position.exitTime) markers.push({ time: Math.floor(position.exitTime / 1000), position: position.side === 'LONG' ? 'aboveBar' : 'belowBar', color: '#f59e0b', shape: 'circle', text: `${position.exitReason ?? 'EXIT'} fill` });
        if (position.status === 'OPEN') {
          priceLineRefs.current.push(seriesRefs.current.price.createPriceLine({ price: position.stopLoss, color: '#ef4444', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'SL' }));
          priceLineRefs.current.push(seriesRefs.current.price.createPriceLine({ price: position.takeProfit, color: '#22c55e', lineWidth: 1, lineStyle: LineStyle.Dashed, axisLabelVisible: true, title: 'TP' }));
          priceLineRefs.current.push(seriesRefs.current.price.createPriceLine({ price: position.entryPrice, color: '#8b93a7', lineWidth: 1, lineStyle: LineStyle.Dotted, axisLabelVisible: true, title: `${position.side} entry` }));
        }
      }
      for (const item of notifications.filter(item => item.signal.symbol === symbol)) markers.push({ time: Math.floor(item.signal.candleOpenTime / 1000), position: item.signal.action === 'ENTRY_LONG' ? 'belowBar' : 'aboveBar', color: item.signal.action === 'ENTRY_LONG' ? '#22c55e' : '#ef4444', shape: item.signal.action === 'ENTRY_LONG' ? 'arrowUp' : 'arrowDown', text: `${item.signal.action === 'ENTRY_LONG' ? 'LONG' : 'SHORT'} signal` });
      seriesRefs.current.price.setMarkers(markers.sort((a, b) => a.time - b.time));
    });
    return () => { cancelled = true; };
  }, [chartReady, notifications, positions, symbol]);

  useEffect(() => {
    if (!live) return;
    const refs = seriesRefs.current;
    if (!refs.price || !refs.volume) return;
    const time = Math.floor(live.openTime / 1000) as any;
    try {
      refs.price.update({ time, open: live.open, high: live.high, low: live.low, close: live.close });
      refs.volume.update({ time, value: live.volume, color: live.close >= live.open ? 'rgba(34,197,94,.45)' : 'rgba(239,68,68,.45)' });
      const last = provisionalIndicators?.ema34.length ? provisionalIndicators.ema34.length - 1 : -1;
      for (const key of ['ema34', 'ema89', 'ema200', 'ema610', 'rsi14', 'macdLine', 'macdSignal', 'macdHistogram'] as const) {
        const series = refs[key];
        const value = provisionalIndicators?.[key]?.[last];
        if (series && value != null) {
          if (key === 'macdHistogram') series.update({ time, value, color: value >= 0 ? 'rgba(34,197,94,.75)' : 'rgba(239,68,68,.75)' });
          else series.update({ time, value });
        }
      }
    } catch { /* A timeframe change can dispose chart series between market updates. */ }
  }, [live, provisionalIndicators]);

  return <div className="flex h-full min-h-0 flex-col bg-terminal-bg">
    <div className="flex h-6 shrink-0 items-center gap-3 border-b border-terminal-border px-3 text-[9px] text-terminal-text-muted"><span>PRICE · EMA</span><span style={{ color: '#f59e0b' }}>EMA 34</span><span style={{ color: '#8b5cf6' }}>EMA 89</span><span style={{ color: '#3b82f6' }}>EMA 200</span><span style={{ color: '#ec4899' }}>EMA 610</span></div>
    <div className="grid min-h-0 flex-1 grid-rows-[53fr_13fr_16fr_18fr]">
      {(['price', 'volume', 'rsi', 'macd'] as const).map(name => <section key={name} className="relative min-h-0 border-b border-terminal-border">
        <span className="pointer-events-none absolute left-2 top-1 z-10 text-[9px] font-medium tracking-wide text-terminal-text-muted">{name === 'price' ? symbol : name === 'volume' ? 'VOLUME' : name === 'rsi' ? 'RSI 14 · 30 / 50 / 70' : 'MACD 12 / 26 / 9'}</span>
        {name === 'price' && <button type="button" aria-label="Jump chart to live" onClick={() => Object.values(chartRefs.current).forEach((chart: any) => chart.timeScale().scrollToRealTime())} className="absolute right-3 top-1 z-20 rounded border border-terminal-border bg-terminal-surface/90 px-2 py-1 text-[10px] font-medium text-terminal-long hover:bg-terminal-border">LIVE · Jump to latest</button>}
        <div ref={node => { paneRefs.current[name] = node; }} className="h-full w-full" />
      </section>)}
    </div>
  </div>;
}
function pnlColorFromValue(v: number | null | undefined): string {
  if (v === null || v === undefined) return 'text-terminal-text-muted';
  return v > 0 ? 'text-terminal-long' : v < 0 ? 'text-terminal-short' : 'text-terminal-text-secondary';
}

