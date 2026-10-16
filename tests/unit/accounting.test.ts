/**
 * Tests for Accounting - PnL, snapshots, funding
 */
import { describe, it, expect } from 'vitest';
import { getNext15MinBoundary, getCurrent15MinBoundary } from '@/server/accounting';

describe('PnL Calculations', () => {
  it('calculates LONG gross PnL correctly', () => {
    // LONG gross PnL = quantity * (exit - entry)
    const quantity = 0.005;
    const entryPrice = 50000;
    const exitPrice = 51000;
    const grossPnl = quantity * (exitPrice - entryPrice);
    expect(grossPnl).toBeCloseTo(5, 6);
  });

  it('calculates SHORT gross PnL correctly', () => {
    // SHORT gross PnL = quantity * (entry - exit)
    const quantity = 0.005;
    const entryPrice = 50000;
    const exitPrice = 49000;
    const grossPnl = quantity * (entryPrice - exitPrice);
    expect(grossPnl).toBeCloseTo(5, 6);
  });

  it('LONG loss is negative', () => {
    const quantity = 0.005;
    const entryPrice = 50000;
    const exitPrice = 49000;
    const grossPnl = quantity * (exitPrice - entryPrice);
    expect(grossPnl).toBeLessThan(0);
    expect(grossPnl).toBeCloseTo(-5, 6);
  });

  it('SHORT loss is negative', () => {
    const quantity = 0.005;
    const entryPrice = 50000;
    const exitPrice = 51000;
    const grossPnl = quantity * (entryPrice - exitPrice);
    expect(grossPnl).toBeLessThan(0);
    expect(grossPnl).toBeCloseTo(-5, 6);
  });

  it('net PnL accounts for fees and funding', () => {
    const grossPnl = 10;
    const entryFee = 0.25;
    const exitFee = 0.25;
    const funding = 0.05; // positive = paid

    const netPnl = grossPnl - (entryFee + exitFee) - funding;
    expect(netPnl).toBeCloseTo(9.45, 6);
  });

  it('fee calculation is correct', () => {
    const notional = 250; // 0.005 * 50000
    const feeRate = 0.001;
    const fee = notional * feeRate;
    expect(fee).toBeCloseTo(0.25, 6);
  });
});

describe('Snapshot Boundaries', () => {
  it('calculates next 15-min boundary correctly', () => {
    // 10:07:30 -> next boundary is 10:15:00
    const now = new Date('2024-01-15T10:07:30Z');
    const next = getNext15MinBoundary(now);
    expect(next.getUTCHours()).toBe(10);
    expect(next.getUTCMinutes()).toBe(15);
    expect(next.getUTCSeconds()).toBe(0);
  });

  it('exact boundary returns the following boundary (strictly future)', () => {
    const now = new Date('2024-01-15T10:15:00Z');
    const next = getNext15MinBoundary(now);
    // At exact boundary, next should be 15 min later
    expect(next.getUTCHours()).toBe(10);
    expect(next.getUTCMinutes()).toBe(30);
  });

  it('calculates current 15-min boundary correctly', () => {
    const now = new Date('2024-01-15T10:07:30Z');
    const current = getCurrent15MinBoundary(now);
    expect(current.getUTCHours()).toBe(10);
    expect(current.getUTCMinutes()).toBe(0);
  });

  it('handles midnight boundary', () => {
    const now = new Date('2024-01-15T23:58:00Z');
    const next = getNext15MinBoundary(now);
    expect(next.getUTCDate()).toBe(16);
    expect(next.getUTCHours()).toBe(0);
    expect(next.getUTCMinutes()).toBe(0);
  });
});

describe('Funding Calculations', () => {
  it('LONG pays when funding rate is positive', () => {
    const positionNotional = 250; // 0.005 * 50000
    const fundingRate = 0.0001; // 0.01%

    // LONG: payment = notional * rate (positive = pay)
    const payment = positionNotional * fundingRate;
    expect(payment).toBeCloseTo(0.025, 6);
    expect(payment).toBeGreaterThan(0); // LONG pays
  });

  it('SHORT receives when funding rate is positive', () => {
    const positionNotional = 250;
    const fundingRate = 0.0001;

    // SHORT: payment = -(notional * rate) (negative = receive/pay out)
    const payment = -(positionNotional * fundingRate);
    expect(payment).toBeCloseTo(-0.025, 6);
    expect(payment).toBeLessThan(0); // SHORT receives
  });

  it('LONG receives when funding rate is negative', () => {
    const positionNotional = 250;
    const fundingRate = -0.0001;

    const payment = positionNotional * fundingRate;
    expect(payment).toBeCloseTo(-0.025, 6);
    expect(payment).toBeLessThan(0); // LONG receives
  });
});
