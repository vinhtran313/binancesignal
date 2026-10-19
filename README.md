# Futures Signal & Paper Trading Terminal

A Binance USDⓈ-M Futures research terminal. Market monitoring and MACD signal alerts run on the server; **a paper position is opened only after an explicit user confirmation**. The application never submits real orders and does not need a Binance trading key.

## Start locally

Prerequisites: Node.js 20+, npm, PostgreSQL 17 Windows binaries, and network access to Binance public market data. The local Windows setup runs PostgreSQL under the current user without installing a Windows service. You can unpack the [official EDB PostgreSQL binaries](https://www.enterprisedb.com/download-postgresql-binaries) into `.tmp\postgres\extracted`; the database scripts use `.tmp\postgres\extracted\pgsql\bin` when present and keep its data in `.tmp\postgres\data`. This temporary folder is ignored by Git. If no project-local binaries are present, the scripts use `%LOCALAPPDATA%\Programs\PostgreSQL\17.11\pgsql\bin`. Docker Compose is also available.

```powershell
npm install
npm run db:up
npm run db:migrate
npm run db:seed
npm run dev
```

Open <http://localhost:3000>. The Next.js server owns one server-side engine instance. It starts on the first dashboard/API request and keeps monitoring while the server process is running, even after the browser tab closes. Do not run `npm run worker` at the same time as `npm run dev` or `npm run start`; both would own separate in-memory market streams. `npm run worker` is the standalone headless entry point.

For production:

```powershell
npm run build
npm run start
```

`npm run db:up` initializes and starts the local user-scoped PostgreSQL cluster. Stop it with `npm run db:down`. If PostgreSQL runs elsewhere, set `DATABASE_URL` in `.env` and skip these commands. Docker Compose remains available through `npm run db:up:docker` and `npm run db:down:docker`.

## Environment

Copy `.env.example` to `.env` and set:

| Variable | Purpose | Default |
|---|---|---|
| `DATABASE_URL` | PostgreSQL connection string | Required |
| `INITIAL_BALANCE` | Paper account starting balance in USDT | 1000 |
| `DEFAULT_RISK_PERCENT` | Equity risk per confirmed trade | 1% |
| `MAX_CONCURRENT_POSITIONS` | Account-wide open position limit | 10 |
| `DEFAULT_LEVERAGE` | Simulated futures leverage assumption | 125x |
| `DEFAULT_TAKER_FEE` | Fee per side | 0.1% |
| `DEFAULT_SLIPPAGE` | Simulated adverse slippage | 0.05% |
| `TELEGRAM_BOT_TOKEN` | Optional Telegram bot token for actionable signal alerts | Empty (disabled) |
| `TELEGRAM_CHAT_ID` | Optional user or group destination for Telegram alerts | Empty (disabled) |
| `WATCHLIST_SYMBOLS` | Comma-separated Binance USDT perpetual assets to monitor; defaults to the curated list below | Curated watchlist |

Fee and slippage values are configurable assumptions, not Binance account quotes.

To enable Telegram alerts, create a bot with Telegram's BotFather, start a conversation with it (or add it to the target group), then set `TELEGRAM_BOT_TOKEN` and `TELEGRAM_CHAT_ID` in `.env`. Keep the token private. The bot sends actionable paper-trading signals only; it does not open a position. Restart the app after changing these values.

The default watchlist is BTC, ETH, BNB, XRP, SOL, HYPE, ZEC, DOGE, XMR, LINK, LEO, NEAR, XLM, BCH, UNI, AVAX, SUI, CC, GRAM, TAO, ENA, OKB, FET, ONDO, DOT, PUMP, and ASTER. The engine checks these symbols against Binance Futures exchange information at startup and monitors eligible USDT perpetuals in this order. Assets without a matching Binance contract are omitted from live monitoring. Set `WATCHLIST_SYMBOLS` in `.env` to change the list.

## Persistence and Vercel

PostgreSQL is required for durable accounts, positions, signals, notifications, and trade history. The local `.env.example` credentials match `docker-compose.yml`; the portable Windows PostgreSQL script also creates the configured local role and database. For production, use a managed PostgreSQL database and set `DATABASE_URL` to its connection string.

Writing database files into the Git repository is not a durable Vercel storage option: Vercel Functions have a read-only filesystem with temporary `/tmp` scratch space ([runtime filesystem](https://vercel.com/docs/functions/runtimes)). Vercel offers managed database providers through its [storage marketplace](https://vercel.com/docs/storage).

The app currently runs its WebSocket market feed, timers, signal processing, and in-memory engine inside a long-lived Node.js process. Vercel Functions do not support WebSocket servers and have bounded invocation durations ([function limits](https://vercel.com/docs/limits)); Vercel Cron on the Hobby plan can run only once per day ([Cron limits](https://vercel.com/docs/cron-jobs/usage-and-pricing)). So deploying the current app to Vercel with only a database URL would not keep live monitoring and signals reliable. A Vercel deployment needs a separate always-on worker (or a redesign around durable scheduled jobs) plus managed PostgreSQL. The current project has not been converted to that split architecture.

## Implemented workflows

- Binance public REST initializes candles and exchange filters; WebSocket updates provisional candles, mark prices and funding data.
- The configured watchlist drives live market monitoring, signal generation and the TradingView-style sidebar. The sidebar shows live mark prices, and selecting a row switches the chart to that symbol.
- The chart contains separate price/EMA, volume, RSI(14), and MACD(12,26,9) panes with synchronized time scales and crosshair. The default strategy/chart interval is M5.
- An intrabar MACD histogram sign transition creates one persistent notification per symbol/timeframe/candle. A signal expires when that candle closes. Dismissed, expired, or rejected signals cannot be confirmed.
- The confirmation dialog shows the signal and current reference price, proposed SL/TP, risk, quantity, fee and margin estimates. The server rechecks expiry, market freshness, symbol eligibility, available balance, risk and exchange filters before it creates one independent paper position.
- Multiple open trades on a symbol are supported. Open trades have fixed Stop Loss and Take Profit targets, configurable mark-price or last-trade triggers, simulated slippage, manual close, fee and funding ledgers, and immutable exit analytics.
- Open and closed trades are stored separately with latest-entry-first sorting, symbol/side/status/date filters, MACD-wave details, exit fills, EMA values captured at exit, fees, funding, PnL and R multiples.
- Account snapshots are persisted at fixed 15-minute boundaries. The header compares current equity with the latest snapshot.

## Commands

```powershell
npm run dev             # Local Next.js server and server-side engine
npm run worker          # Headless server-side engine (run by itself)
npm run build           # Production build
npm run lint            # ESLint
npm test                # Unit and integration tests
npm run test:e2e        # Playwright browser tests
npm run db:up           # Start portable local PostgreSQL
npm run db:down         # Stop portable local PostgreSQL
npm run db:up:docker    # Optional Docker Compose PostgreSQL
npm run db:down:docker  # Stop optional Docker Compose PostgreSQL
npm run db:migrate      # Apply Prisma migrations
npm run db:migrate:prod # Apply deployed migrations
npm run db:seed         # Ensure the paper account exists
npm run db:studio       # Prisma Studio
```

## Accounting model and limitations

Positions use a linear USDT perpetual model. Gross PnL is quantity multiplied by the side-adjusted entry/exit price difference. Net PnL includes separately recorded entry/exit fees and funding. Available balance subtracts reserved margin. Leverage is configurable, but exact Binance cross-margin, liquidation, partial-fill, and order-book behavior is not implemented. Simulated targets are distinct from actual fills; a gap may produce an adverse fill. The configured watchlist is not a historical universe for backtests.

The application is a research simulator and must not be treated as a live execution system.
