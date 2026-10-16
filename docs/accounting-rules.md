# Accounting Rules

## Balance Model

- **Balance**: Cash amount (initial + realized PnL - fees - funding)
- **Equity**: Balance + Unrealized PnL
- **Available Balance**: Equity - Used Margin
- **Used Margin**: Sum of margin for all open positions

## Fee Model

- Entry fee = entry notional × taker fee rate
- Exit fee = exit notional × taker fee rate
- Default taker fee: 0.1% (0.001)
- **Configurable**: This default is a fallback assumption. Actual Binance fees depend on your VIP level and BNB holdings.
- Fees are deducted from balance at the time of entry and exit.

## Funding Model

- Funding is processed at each funding timestamp (typically every 8 hours)
- LONG: payment = position_notional × funding_rate
  - Positive rate → LONG pays
  - Negative rate → LONG receives
- SHORT: payment = -(position_notional × funding_rate)
  - Positive rate → SHORT receives
  - Negative rate → SHORT pays
- Funding events are idempotent (keyed by position + funding time)

## PnL Calculation

### Gross PnL
- LONG: quantity × (exit_price - entry_price)
- SHORT: quantity × (entry_price - exit_price)

### Net PnL
- net_pnl = gross_pnl - entry_fee - exit_fee - funding_paid
- PnL% = (net_pnl / margin) × 100

## Position Sizing

```
risk_budget = equity × (risk_percent / 100)
stop_distance = |entry_price - stop_price|
raw_quantity = risk_budget / stop_distance
quantity = floor(raw_quantity / step_size) × step_size
```

Constraints checked:
1. quantity >= min_qty
2. quantity <= max_qty
3. entry_notional >= min_notional
4. margin + fees <= available_balance
5. actual_risk <= risk_budget (with 1% tolerance for rounding)
6. open_positions < max_positions
7. no existing position for this symbol

## Execution Assumptions

| Parameter | Value | Notes |
|---|---|---|
| Reference price | Candle close price | At confirmed close |
| Entry slippage | +0.05% for LONG, -0.05% for SHORT | Adverse direction |
| Exit slippage | -0.05% for LONG, +0.05% for SHORT | Adverse direction |
| SL trigger | Mark price crosses SL level | Checked every ~1 second |
| SL fill | At SL price (with slippage) | Not at market price |
| Fill timing | At candle close + processing | Not intrabar |

## Snapshot Model

- Snapshots taken at fixed 15-minute clock boundaries (e.g., 09:45, 10:00, 10:15)
- Stored in UTC, displayed in Asia/Ho_Chi_Minh
- Equity change = (current_equity - previous_snapshot_equity) / previous_snapshot_equity × 100
- Idempotent: only one snapshot per account per boundary

## Limitations

This simulator does NOT model:
- Order book depth or partial fills
- Actual Binance margin mechanics
- Liquidation
- Cross/isolated margin modes
- Insurance fund
- ADL (Auto-Deleveraging)
- Mark price vs last price execution differences (beyond SL trigger)
