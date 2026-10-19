import { beforeAll, afterAll, vi } from 'vitest';

process.env.DATABASE_URL = 'postgresql://test:test@localhost:5432/test_db';
process.env.DEFAULT_LEVERAGE = '1';
process.env.DEFAULT_RISK_PERCENT = '1';
process.env.MAX_CONCURRENT_POSITIONS = '10';
process.env.INITIAL_BALANCE = '1000';
process.env.DEFAULT_TAKER_FEE = '0.001';
process.env.DEFAULT_MAKER_FEE = '0.001';
process.env.DEFAULT_SLIPPAGE = '0.0005';

beforeAll(() => {
  // Setup
});

afterAll(() => {
  // Cleanup
});
