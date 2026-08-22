# CLAUDE.md

This file provides guidance to Claude Code (claude.ai/code) when working with code in this repository.

## Project overview

Farm TMA is a Telegram Mini App: an idle farming game with an Ad-Pool economy (rewards for watching ads, multi-level referrals) and real TON/USDT withdrawals.

- `backend/` — NestJS + Prisma + PostgreSQL + Redis/BullMQ
- `frontend/` — Vite + React + TypeScript + Tailwind v4, `@telegram-apps/sdk-react` + `@tonconnect/ui-react`

## Commands

### Backend (`cd backend`)

```bash
npm run start:dev        # nest start --watch, http://localhost:3000 (or PORT from .env)
npm run build             # nest build
npm run lint               # eslint --fix on src/apps/libs/test
npm test                   # jest (run a single file: npx jest path/to/file.spec.ts)
npx prisma generate        # regenerate Prisma client after schema.prisma changes
npx prisma migrate dev --name <desc>   # create+apply a migration (needs DIRECT_URL, not the pooled one)
npx prisma studio
node scripts/generate-test-init-data.js 111111   # print a validly-signed initData for Telegram user 111111
```

Auth for manual testing always goes through a real signed `initData` (see below), never a hand-crafted header — `TelegramAuthGuard` validates an HMAC-SHA256 signed with `BOT_TOKEN`.

```bash
export INIT_DATA=$(node scripts/generate-test-init-data.js 111111)
curl -s -X POST "http://localhost:3000/auth/telegram" -H "X-Telegram-Init-Data: $INIT_DATA" | jq
```

Full curl walkthroughs for every module (farm, tasks, withdrawals, deposits, ads webhook/simulator, admin) are in the root `README.md` — read it before re-deriving request shapes.

### Frontend (`cd frontend`)

```bash
npm run dev       # Vite dev server, http://localhost:5173+
npm run build     # tsc -b && vite build
npm run lint      # oxlint
npm run preview
```

Outside of Telegram, the SDK's mock `initData` has an invalid signature and the backend will reject every authenticated request with 401. To develop in a normal browser, set `VITE_DEV_INIT_DATA` in `frontend/.env` to the output of `generate-test-init-data.js` (same `BOT_TOKEN` as backend) and restart `npm run dev` — Vite only reads `.env` at startup.

### Local infra

```bash
docker compose up -d   # Postgres (farm/farm/farm_tma @ 5432) + Redis (6379)
```

If Docker isn't available, `backend/.env` can instead point at a Supabase Postgres (`DATABASE_URL` = transaction pooler :6543 with `?pgbouncer=true`, `DIRECT_URL` = session pooler :5432, migrations require the direct one) and an Upstash Redis (`REDIS_URL=rediss://...`). See the "Alternativa sin Docker" section of the root README for exact gotchas (password encoding, `[YOUR-PASSWORD]` placeholder, EPERM on Windows if a previous `node`/`nest --watch` process still holds the Prisma engine DLL loaded).

## Architecture

### Two-currency economy — the invariant that shapes everything

- **Bucks**: earned only from ad revenue (`ads/`), withdrawable to real TON/USDT. Every Bucks-denominated action must keep the Ad-Pool solvent — see `pool/`.
- **Coins**: earned from farming/selling resources, used as a sink (silo upgrades, non-withdrawable). Never let a feature pay out Bucks for something that isn't backed by real ad revenue (this was an explicit, deliberate design decision — see `FarmService.sell`/`upgradeStorage`, which are Coins-only by design, not by oversight).

Money never moves on a client's say-so. Both outgoing withdrawals and incoming deposits are confirmed only after independent on-chain verification server-side (`TonService`) — nothing in `withdrawals/` or `deposits/` trusts a client-reported "I paid" or "I received".

### Backend module map (`backend/src/`)

- `auth/` — `TelegramAuthGuard` validates the `X-Telegram-Init-Data` header's HMAC signature against `BOT_TOKEN`; `AuthService` handles login/registration and referral `start_param` capture. Every authenticated endpoint depends on this running first — a brand-new user hitting any other endpoint before `POST /auth/telegram` will fail.
- `farm/` — idle production math (hourly rates, "ripeness" as an elapsed-production-hours fraction), harvest/collect, inventory, storage capacity (aggregate cap, not per-resource), Coins-paid boosts (`activateBoost`) and the shared `grantBoost` used by both Bucks-boost and TON-deposit-boost paths. The production formula itself lives in `farm-production.util.ts` (`computeProduction`, a pure function with no Prisma/Nest dependency) so `worker/` can reuse the exact same math for its offline-earnings simulation instead of a second copy that could drift.
- `worker/` — the auto-harvest/auto-sell "Peón": `WorkerService.processOfflineEarnings` simulates every full walk-cycle (`WORKER_TIERS[level].walkSpeedMPerSec`/`inventoryCapacity` from `worker.constants.ts`) elapsed since `Worker.lastProcessedAt`, capped at `WORKER_MAX_OFFLINE_HOURS`, and credits Coins directly (never touches `Inventory` — production is harvested and sold in the same step, so there's nothing left to reconcile with manual selling). Runs lazily (no cron/BullMQ) inside `GET /worker` and `MeController.getState` — `unlock`/`upgrade` are Coins sinks (`SINK_WORKER`) mirroring `upgradeStorage`/`upgradeAnimal`; `WORKER_AUTO_SELL` is the earn-side transaction type.
- `withdrawals/` — `WithdrawalsService` validates pool solvency + risk score, then a BullMQ job (`withdrawals.processor.ts`) sends the actual TON/jetton transfer via `TonService`. `reconciliation.processor.ts` + `.scheduler.ts` run a periodic sweep over stuck `PROCESSING` withdrawals, re-verify on-chain, and safely refund on confirmed failure.
- `deposits/` — mirrors the withdrawals reconciliation pattern in reverse: `createIntent` generates a `PENDING` `DepositRequest` with a unique reference and exact expected amount; `checkDeposit`/`sweepPending` verify an incoming transaction via `TonService.findIncomingDeposit` (matching amount with fee tolerance + comment payload) before calling `applyEffect` (currently only `FARM_BOOST`). `network`/`asset` are plain `String` columns, not enums — this is deliberate so BSC/TRON deposit support can be added later without a migration; only `'TON'` is implemented today.
- `ton/` — `TonService`, shared by `withdrawals/` and `deposits/` via `TonModule`. Wraps `@ton/ton`/`@ton/core`/`@ton/crypto`: wallet loading, sending internal messages/jetton transfers with a comment cell (opcode 0 + UTF-8 via `comment()`), and scanning recent treasury transactions to confirm payments/deposits. Note: transaction scans are capped at the last 50 txs, unpaginated — a documented limitation under load (see comments on `findRecentPayment`/`findIncomingDeposit`).
- `admin/` — backoffice endpoints guarded by `AdminGuard` (`X-Admin-Secret`, not Telegram auth): approve/reject `RISK_REVIEW` withdrawals, pool health, suspicious users.
- `pool/` — Ad-Pool solvency accounting that Bucks-denominated actions (ad rewards, withdrawals) must respect.
- `ads/` — `POST /ads/webhook` (server-to-server, per-network shared secret: `ADSGRAM_WEBHOOK_SECRET`/`MONETAG_WEBHOOK_SECRET`) is the only legitimate way to credit ad-reward Bucks. `POST /ads/simulate` is a dev-only stand-in gated by `NODE_ENV !== 'production'` (throws otherwise) — authenticated as the current user via Telegram initData, deliberately never given access to the webhook secret, since that would let a client self-credit rewards.
- `tasks/` — one-shot task definitions/progress (`tasks.constants.ts`); tasks do not reset daily.
- `referrals/` — referral tree + link generation logic backing the deep-link flow.
- `me/` — `GET /me/state`, a consolidated bootstrap endpoint (`{user, farm, inventory, tasks, referrals, withdrawals, worker}` in one response) that the frontend's `AppStateProvider` calls instead of hitting `/farm`, `/farm/inventory`, `/tasks`, `/referrals/tree`, `/withdrawals` and `/worker` separately on every tab. Mostly a read aggregation over the other modules' existing services (`FarmService`, `TasksService`, `ReferralsService`, `WithdrawalsService`) — the one exception is `WorkerService.getState`, which is awaited *before* the rest of the `Promise.all` (not inside it) because it can mutate `farm.lastCollectedAt`/`user.coinsBalance` as a side effect (offline auto-harvest), and running it concurrently with `FarmService.getState` would race on which write lands first.
- `common/` — `TelegramAuthGuard`, `AdminGuard`, `AdsWebhookGuard`, `ParseBigIntPipe` (Prisma `BigInt` ids need this in route params), `CurrentUser` decorator.

`main.ts` monkey-patches `BigInt.prototype.toJSON` — Prisma `BigInt` id fields don't serialize via `JSON.stringify` otherwise, and this is depended on globally rather than per-response.

### Frontend structure (`frontend/src/`)

- `lib/auth.tsx` — `AppStateProvider`/`useAppState()`: the single source of truth for everything the 4 tabs need (user balances, farm, inventory, tasks, referrals, withdrawals, worker). On mount it calls `POST /auth/telegram` (forwarding `start_param` for referrals) then `GET /me/state` once, instead of each view fetching its own slice — tab switches read from this shared state and fire zero network requests. It also seeds the first render from a `localStorage` cache of the last successful bootstrap (`stale: true` until the real fetch resolves) so reopening the app shows content instantly instead of a loading screen. Exposes `refetch()` (re-hit `GET /me/state`, call after any mutating action so other tabs stay in sync), `refetchFarm()` (lightweight `GET /farm` for `Farm.tsx`'s 5s production-tick poll), `refetchIfStale()` (background resync if the cached data is older than 10s, called by views on mount/tab-activation to catch server-side changes like an admin-approved withdrawal), and `clearWorkerPayout()` (nulls `worker.lastPayout` after the "your worker earned X while away" toast shows once — `writeCache` also force-nulls it before persisting, so a reload never resurrects a stale payout toast from localStorage).
- `lib/telegram.ts` — Telegram SDK setup/mocking for dev.
- `lib/farmEconomy.ts` / `lib/farmSprites.ts` — client-side mirror of the idle production/ripeness math for animation purposes, and the hand-drawn Canvas sprite rendering for plots/crops by maturity state.
- `lib/workerEconomy.ts` / `lib/workerSprite.ts` — same mirroring pattern as `farmEconomy.ts`/`farmSprites.ts` but for the auto-harvest Worker: `WORKER_HANDLING_TIME_SEC` (must match `backend/src/worker/worker.constants.ts`) only splits the real `cycleDurationSec` from the API into animation phases, never affects earnings; `drawWorkerSprite` renders the walking/harvesting/selling state machine (`WorkerPanel` in `Farm.tsx`), with a basket that visually fills/empties by `loadFraction`.
- `lib/deposits.ts` — builds the TonConnect `SendTransactionRequest` for a deposit (`@ton/core`'s `comment()` to attach the deposit reference the backend matches against).
- `lib/referral.ts` — builds `https://t.me/<bot>/<app>?startapp=ref_<id>` from `VITE_BOT_USERNAME`/`VITE_MINI_APP_SHORT_NAME`.
- `views/` — one file per bottom-nav tab: `Farm.tsx` (canvas, harvest, ad simulator, TON deposit boost), `Storage.tsx` (sell resources / upgrade silo, Coins only), `Tasks.tsx`, `Withdraw.tsx`.
- `vite.config.ts` — `vite-plugin-node-polyfills({ include: ['buffer'] })` is required because `@ton/core` uses Node's `Buffer` internally; removing it silently white-screens the entire app with no visible React error (watch for this if adding any other Node-flavored library to the frontend). `server.allowedHosts: true` is there so the app can be opened inside Telegram's webview via a tunnel (ngrok/cloudflared).

### Env-var driven behavior worth knowing before touching related code

- `WITHDRAWAL_MIN_USD` is currently `0.01` in `backend/.env` (a deliberate temporary value to test small TON withdrawals against testnet) — this is a standing TODO to revert to a real value (reference default `1`) before anything resembling production. Don't "fix" it back without being asked; it's tracked, not forgotten.
- `TON_RPC_ENDPOINT` containing the substring `testnet` switches `TonService` address formatting to testnet mode (`{ testOnly: true }`) — mismatched formatting breaks wallet compatibility.
- `RECONCILE_SWEEP_INTERVAL_MINUTES` / `RECONCILE_STUCK_PROCESSING_MINUTES` and `DEPOSIT_SWEEP_INTERVAL_MINUTES` are the knobs to lower when manually verifying sweep behavior in development without waiting.
