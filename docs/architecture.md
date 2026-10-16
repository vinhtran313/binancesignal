# Architecture

## Core Components

### Market Data Service (`src/server/market-data/`)
- REST client for Binance USDⓈ-M Futures API
- WebSocket client for real-time klines and mark price
- Handles reconnection, rate limits, dedup

### Indicator Engine (`src/server/indicators/`)
- EMA (34, 89, 200, 610)
- RSI (14)
- MACD (12, 26, 9)
- Pure functions, no side effects
- Consistent formulas between chart and strategy

### Strategy Engine (`src/server/strategy-engine/`)
- MACD Histogram Reversal signal detection
- Wave-based Stop Loss calculation
- Signal deduplication via idempotency keys
- Modular: wave detection isolated for future revision

### Risk Engine (`src/server/risk-engine/`)
- Risk-based position sizing
- Exchange filter validation (tick size, step size, min qty, min notional)
- Margin and fee estimation
- Constraint verification

### Execution Engine (`src/server/execution-engine/`)
- Simulated market order fills with slippage
- Stop Loss monitoring and execution
- Idempotent position creation
- Never submits real orders

### Accounting (`src/server/accounting/`)
- Balance, equity, margin tracking
- PnL: gross, fees, funding, net
- 15-minute snapshot scheduling
- Funding rate processing per position

### Trading Engine (`src/server/engine.ts`)
- Singleton orchestrator
- Connects all components
- Broadcasts state via SSE
- Strategy lifecycle management

## Data Flow

```
Binance WS → Candle → Update History → Calculate Indicators
                   ↓
              [Candle Close?]
                   ↓ yes
           Check MACD Signal → [Qualified?]
                                    ↓ yes
                              Risk Sizing → [Valid?]
                                                ↓ yes
                                         Execute Entry → Persist
                                                              ↓
                                                    Broadcast to UI
```

## Execution Assumptions

| Parameter | Default | Notes |
|---|---|---|
| Reference price | Candle close | At confirmed close |
| Slippage | 0.05% | Applied adverse direction |
| Fill price | Close ± slippage | Simulated |
| Taker fee | 0.1% per side | Configurable |
| SL trigger | Mark price vs SL | Checked every second |
| SL execution | At SL price ± slippage | Conservative |

These assumptions are documented, configurable, and do not claim Binance execution parity.
