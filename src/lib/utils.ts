import { type ClassValue, clsx } from 'clsx';
import { twMerge } from 'tailwind-merge';

export function cn(...inputs: ClassValue[]) {
  return twMerge(clsx(inputs));
}

/**
 * Format number with specified decimal places
 */
export function formatNumber(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format price based on magnitude
 */
export function formatPrice(value: number | null | undefined): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  if (value >= 1000) return formatNumber(value, 2);
  if (value >= 1) return formatNumber(value, 4);
  if (value >= 0.01) return formatNumber(value, 6);
  return formatNumber(value, 8);
}

/**
 * Format USDT value
 */
export function formatUSDT(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return `${value >= 0 ? '' : '-'}$${Math.abs(value).toLocaleString('en-US', {
    minimumFractionDigits: decimals,
    maximumFractionDigits: decimals,
  })}`;
}

/**
 * Format percentage
 */
export function formatPercent(value: number | null | undefined, decimals: number = 2): string {
  if (value === null || value === undefined || isNaN(value)) return 'N/A';
  const sign = value > 0 ? '+' : '';
  return `${sign}${value.toFixed(decimals)}%`;
}

/**
 * Format quantity
 */
export function formatQuantity(value: number | null | undefined, decimals: number = 4): string {
  if (value === null || value === undefined || isNaN(value)) return '—';
  return value.toLocaleString('en-US', {
    minimumFractionDigits: 0,
    maximumFractionDigits: decimals,
  });
}

/**
 * Format timestamp for display (Ho Chi Minh timezone)
 */
export function formatTimestamp(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    day: '2-digit',
    month: '2-digit',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Format time only
 */
export function formatTime(ts: number | null | undefined): string {
  if (!ts) return '—';
  return new Date(ts).toLocaleString('en-GB', {
    timeZone: 'Asia/Ho_Chi_Minh',
    hour: '2-digit',
    minute: '2-digit',
    second: '2-digit',
    hour12: false,
  });
}

/**
 * Get PnL color class
 */
export function pnlColor(value: number | null | undefined): string {
  if (value === null || value === undefined) return 'text-terminal-text-secondary';
  if (value > 0) return 'text-terminal-long';
  if (value < 0) return 'text-terminal-short';
  return 'text-terminal-text-secondary';
}

/**
 * Get side color class
 */
export function sideColor(side: string): string {
  return side === 'LONG' ? 'text-terminal-long' : 'text-terminal-short';
}

/**
 * Get side bg class
 */
export function sideBg(side: string): string {
  return side === 'LONG' ? 'bg-terminal-long-bg' : 'bg-terminal-short-bg';
}
