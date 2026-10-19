ALTER TABLE "Account"
  ALTER COLUMN "balance" SET DEFAULT 1000,
  ALTER COLUMN "initialBalance" SET DEFAULT 1000;

ALTER TABLE "Position"
  ALTER COLUMN "riskRewardRatio" SET DEFAULT 1.2;

ALTER TABLE "SignalEvent"
  ADD COLUMN "strengthScore" INTEGER NOT NULL DEFAULT 0,
  ADD COLUMN "strengthLabel" TEXT NOT NULL DEFAULT 'UNSCORED',
  ADD COLUMN "strengthBreakdown" JSONB NOT NULL DEFAULT '{}'::jsonb,
  ADD COLUMN "scoreVersion" TEXT NOT NULL DEFAULT 'legacy';

-- Keep the existing signal history, but stop any v1 worker state from being restored.
UPDATE "StrategyRun"
SET "status" = 'STOPPED', "stoppedAt" = CURRENT_TIMESTAMP
WHERE "status" IN ('RUNNING', 'PAUSED');

-- Rebase untouched paper accounts to the v1.1 starting capital without changing accounts
-- that already have trade history.
UPDATE "Account" AS account
SET "balance" = 1000, "initialBalance" = 1000
WHERE account."initialBalance" = 500
  AND account."totalFees" = 0
  AND account."realizedPnl" = 0
  AND NOT EXISTS (
    SELECT 1 FROM "Position" AS position WHERE position."accountId" = account."id"
  );

-- Prevent opening a second position for the same coin even if two signals arrive together.
CREATE UNIQUE INDEX "Position_one_open_position_per_account_symbol_key"
ON "Position" ("accountId", "symbol")
WHERE "status" = 'OPEN';
