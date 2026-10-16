-- CreateTable
CREATE TABLE "Account" (
    "id" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'Paper Trading',
    "balance" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "realizedPnl" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalFees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "totalFunding" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "initialBalance" DOUBLE PRECISION NOT NULL DEFAULT 500,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Account_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AccountSnapshot" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "balance" DOUBLE PRECISION NOT NULL,
    "equity" DOUBLE PRECISION NOT NULL,
    "unrealizedPnl" DOUBLE PRECISION NOT NULL,
    "realizedPnl" DOUBLE PRECISION NOT NULL,
    "totalFees" DOUBLE PRECISION NOT NULL,
    "totalFunding" DOUBLE PRECISION NOT NULL,
    "openPositionsCount" INTEGER NOT NULL,
    "snapshotTime" TIMESTAMP(3) NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AccountSnapshot_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Position" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "status" TEXT NOT NULL DEFAULT 'OPEN',
    "entryPrice" DOUBLE PRECISION NOT NULL,
    "exitPrice" DOUBLE PRECISION,
    "quantity" DOUBLE PRECISION NOT NULL,
    "leverage" INTEGER NOT NULL DEFAULT 1,
    "margin" DOUBLE PRECISION NOT NULL,
    "stopLoss" DOUBLE PRECISION NOT NULL,
    "takeProfit" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "riskRewardRatio" DOUBLE PRECISION NOT NULL DEFAULT 2,
    "initialRiskBudget" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "entryTime" TIMESTAMP(3) NOT NULL,
    "exitTime" TIMESTAMP(3),
    "entryNotional" DOUBLE PRECISION NOT NULL,
    "exitNotional" DOUBLE PRECISION,
    "realizedGrossPnl" DOUBLE PRECISION,
    "entryFee" DOUBLE PRECISION NOT NULL,
    "exitFee" DOUBLE PRECISION,
    "totalFees" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "fundingPaid" DOUBLE PRECISION NOT NULL DEFAULT 0,
    "netPnl" DOUBLE PRECISION,
    "pnlPercent" DOUBLE PRECISION,
    "exitReason" TEXT,
    "strategyRunId" TEXT,
    "signalId" TEXT,
    "idempotencyKey" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "Position_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "StrategyRun" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "name" TEXT NOT NULL DEFAULT 'MACD Histogram Reversal',
    "timeframe" TEXT NOT NULL DEFAULT '5m',
    "status" TEXT NOT NULL DEFAULT 'IDLE',
    "configJson" TEXT NOT NULL DEFAULT '{}',
    "startedAt" TIMESTAMP(3),
    "stoppedAt" TIMESTAMP(3),
    "lastProcessedAt" TIMESTAMP(3),
    "errorMessage" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "StrategyRun_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SignalEvent" (
    "id" TEXT NOT NULL,
    "strategyRunId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "action" TEXT NOT NULL,
    "result" TEXT NOT NULL DEFAULT 'ACTIONABLE',
    "rejectReason" TEXT,
    "entryPrice" DOUBLE PRECISION,
    "stopLoss" DOUBLE PRECISION,
    "candleCloseTime" TIMESTAMP(3) NOT NULL,
    "candleOpenTime" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "confirmationTime" TIMESTAMP(3),
    "takeProfit" DOUBLE PRECISION,
    "macdLine" DOUBLE PRECISION NOT NULL,
    "macdSignal" DOUBLE PRECISION NOT NULL,
    "macdHistogram" DOUBLE PRECISION NOT NULL,
    "prevHistogram" DOUBLE PRECISION NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SignalEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "Notification" (
    "id" TEXT NOT NULL,
    "signalId" TEXT NOT NULL,
    "readAt" TIMESTAMP(3),
    "dismissedAt" TIMESTAMP(3),
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "Notification_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "TradeAnalytics" (
    "id" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "sourceSignalId" TEXT NOT NULL,
    "strategyVersion" TEXT NOT NULL,
    "timeframe" TEXT NOT NULL,
    "signalSnapshot" JSONB NOT NULL,
    "entrySnapshot" JSONB NOT NULL,
    "previousWave" JSONB NOT NULL,
    "exitSnapshot" JSONB,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "TradeAnalytics_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FundingEvent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "fundingRate" DOUBLE PRECISION NOT NULL,
    "positionSize" DOUBLE PRECISION NOT NULL,
    "markPrice" DOUBLE PRECISION NOT NULL,
    "payment" DOUBLE PRECISION NOT NULL,
    "fundingTime" TIMESTAMP(3) NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FundingEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "FeeEvent" (
    "id" TEXT NOT NULL,
    "accountId" TEXT NOT NULL,
    "positionId" TEXT NOT NULL,
    "symbol" TEXT NOT NULL,
    "side" TEXT NOT NULL,
    "feeRate" DOUBLE PRECISION NOT NULL,
    "notional" DOUBLE PRECISION NOT NULL,
    "feeAmount" DOUBLE PRECISION NOT NULL,
    "idempotencyKey" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "FeeEvent_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "SymbolUniverse" (
    "id" TEXT NOT NULL,
    "symbolsJson" TEXT NOT NULL,
    "source" TEXT NOT NULL DEFAULT 'coingecko',
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "SymbolUniverse_pkey" PRIMARY KEY ("id")
);

-- CreateTable
CREATE TABLE "AppEvent" (
    "id" TEXT NOT NULL,
    "type" TEXT NOT NULL,
    "severity" TEXT NOT NULL DEFAULT 'INFO',
    "message" TEXT NOT NULL,
    "dataJson" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "AppEvent_pkey" PRIMARY KEY ("id")
);

-- CreateIndex
CREATE INDEX "AccountSnapshot_accountId_snapshotTime_idx" ON "AccountSnapshot"("accountId", "snapshotTime");

-- CreateIndex
CREATE UNIQUE INDEX "AccountSnapshot_accountId_snapshotTime_key" ON "AccountSnapshot"("accountId", "snapshotTime");

-- CreateIndex
CREATE UNIQUE INDEX "Position_signalId_key" ON "Position"("signalId");

-- CreateIndex
CREATE UNIQUE INDEX "Position_idempotencyKey_key" ON "Position"("idempotencyKey");

-- CreateIndex
CREATE INDEX "Position_accountId_status_idx" ON "Position"("accountId", "status");

-- CreateIndex
CREATE INDEX "Position_symbol_status_idx" ON "Position"("symbol", "status");

-- CreateIndex
CREATE INDEX "Position_entryTime_idx" ON "Position"("entryTime");

-- CreateIndex
CREATE INDEX "StrategyRun_accountId_status_idx" ON "StrategyRun"("accountId", "status");

-- CreateIndex
CREATE UNIQUE INDEX "SignalEvent_idempotencyKey_key" ON "SignalEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "SignalEvent_strategyRunId_symbol_idx" ON "SignalEvent"("strategyRunId", "symbol");

-- CreateIndex
CREATE INDEX "SignalEvent_candleCloseTime_idx" ON "SignalEvent"("candleCloseTime");

-- CreateIndex
CREATE UNIQUE INDEX "Notification_signalId_key" ON "Notification"("signalId");

-- CreateIndex
CREATE INDEX "Notification_createdAt_idx" ON "Notification"("createdAt");

-- CreateIndex
CREATE INDEX "Notification_readAt_idx" ON "Notification"("readAt");

-- CreateIndex
CREATE UNIQUE INDEX "TradeAnalytics_positionId_key" ON "TradeAnalytics"("positionId");

-- CreateIndex
CREATE INDEX "TradeAnalytics_sourceSignalId_idx" ON "TradeAnalytics"("sourceSignalId");

-- CreateIndex
CREATE UNIQUE INDEX "FundingEvent_idempotencyKey_key" ON "FundingEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FundingEvent_positionId_idx" ON "FundingEvent"("positionId");

-- CreateIndex
CREATE INDEX "FundingEvent_fundingTime_idx" ON "FundingEvent"("fundingTime");

-- CreateIndex
CREATE UNIQUE INDEX "FeeEvent_idempotencyKey_key" ON "FeeEvent"("idempotencyKey");

-- CreateIndex
CREATE INDEX "FeeEvent_positionId_idx" ON "FeeEvent"("positionId");

-- CreateIndex
CREATE INDEX "SymbolUniverse_createdAt_idx" ON "SymbolUniverse"("createdAt");

-- CreateIndex
CREATE INDEX "AppEvent_type_createdAt_idx" ON "AppEvent"("type", "createdAt");

-- AddForeignKey
ALTER TABLE "AccountSnapshot" ADD CONSTRAINT "AccountSnapshot_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_strategyRunId_fkey" FOREIGN KEY ("strategyRunId") REFERENCES "StrategyRun"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Position" ADD CONSTRAINT "Position_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "SignalEvent"("id") ON DELETE SET NULL ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "StrategyRun" ADD CONSTRAINT "StrategyRun_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "SignalEvent" ADD CONSTRAINT "SignalEvent_strategyRunId_fkey" FOREIGN KEY ("strategyRunId") REFERENCES "StrategyRun"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "Notification" ADD CONSTRAINT "Notification_signalId_fkey" FOREIGN KEY ("signalId") REFERENCES "SignalEvent"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "TradeAnalytics" ADD CONSTRAINT "TradeAnalytics_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE CASCADE ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingEvent" ADD CONSTRAINT "FundingEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FundingEvent" ADD CONSTRAINT "FundingEvent_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeEvent" ADD CONSTRAINT "FeeEvent_accountId_fkey" FOREIGN KEY ("accountId") REFERENCES "Account"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

-- AddForeignKey
ALTER TABLE "FeeEvent" ADD CONSTRAINT "FeeEvent_positionId_fkey" FOREIGN KEY ("positionId") REFERENCES "Position"("id") ON DELETE RESTRICT ON UPDATE CASCADE;

