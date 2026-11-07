# myFin — personal finance & cash flow

A mobile-first personal finance app that replaces a monthly income/expense spreadsheet. Open it, see your position, and tick bills **paid** (or income **received**) with one tap.

- **Stack:** Next.js 16 (App Router, Turbopack, Cache Components), React 19, TypeScript, Tailwind CSS 4, Supabase (Postgres + Auth + RLS), Recharts, Lucide, React Hook Form + Zod, SWR.
- **Platforms:** iPhone, iPad and desktop. Installable as a PWA; structured so it can be wrapped with Capacitor later.
- **Defaults:** BDT (৳), Asia/Dhaka.

---

## Features

| Area | What you get |
|---|---|
| **Overview** | Available balance (income received − expenses paid), money in / out, saving vs overspending, monthly progress, 8 summary tiles (budgeted vs actual), pending & overdue payments with one-tap pay, 6-month income vs expense chart, spending by category, recent transactions, month-end review. |
| **Monthly Budget** | Each month has its own items. One-tap Paid/Received with **Undo**, partial payments, actual-vs-budget with automatic variance, carried-forward balances, payment history timeline, edit budget (optionally for all future months), due dates, notes, add one-off items, copy last month's budget, month notes. |
| **Carry-forward** | Unpaid balances roll into the next month for categories with carry-forward on (per category, income and expense). Never double-counted; each payment is linked to the original item. |
| **Transactions** | Income / expense / transfer / adjustment ledger with search, type/category/method filters, date presets and custom range, edit, delete with confirmation and undo, CSV export. |
| **Analytics** | Year switcher, income/expenses/savings, savings rate, average/highest/lowest spending month, outstanding liabilities & receivables, income-vs-expense bars (with table view), savings trend, category donut, budget variance chart, budget-vs-actual table. |
| **Reminders** | Set a due date on any item (tap it in the budget). Every morning (08:30 Dhaka) a push notification lists bills due within your "days before" window, due today, and overdue — even when the app is closed. |
| **Household** | Shared shopping list with your family (separate logins; finances stay private). Adding an item notifies the others instantly; marking it bought (qty, price, shop) notifies the person who asked, optionally records the cost under *Groceries* in your expenses, and teaches myFin how long that quantity lasts. Pantry forecasts ("~5 days left"), "running low soon" suggestions and a morning run-out alert, price history (per-unit price, % change, cheapest shop) and spending insights. |
| **Recurring** | Monthly, weekly, yearly and custom (every N days/weeks/months) rules. Items are generated once per month — reopening a month never duplicates, and deleted items stay deleted. |
| **Settings** | Profile, currency, timezone, theme (auto/light/dark), notifications, categories (icons, groups, default budget, due day, carry-forward, archive), payment methods (default for one-tap), recurring items, CSV export, JSON backup & restore, password/email change, sign out everywhere, install guide. |

New accounts are seeded with your income (Salary ৳280,000, Shuttle ৳100,000, Lunch Allowance ৳30,000) and the 17 expense items as monthly recurring items, all editable. **The seeded due days are placeholders** (e.g. Rent on the 5th, cards on the 20th/25th) — set your real ones under *Settings → Recurring items*.

---

## How the money logic works

```
categories ─┬─ recurring_rules ──(ensure_month)──► obligations (one per item per month)
            │                                          ▲
            └──────────────── transactions ──trigger──► payment_allocations
```

- An **obligation** is one monthly line item, e.g. *Electricity Bill — Dec 2026*. Its charge is `actual_amount` if set, otherwise `budget_amount`. Changing the actual never touches the budget, so variance is always available.
- A **transaction** is real money moving. When it is linked to an obligation, a database trigger splits it into **payment allocations**, oldest balance first:
  1. unpaid balances of earlier months for the same category (only if the category carries forward and this item is the month's first item for that category);
  2. the remainder to the item itself.
- Each obligation's `outstanding = charge − its own allocations`. A "carried" balance is simply the unpaid remainder of the original item, so it can never be counted twice. If you later pay the old month directly, the newer month's carried amount shrinks automatically.
- Month figures are **cash basis**: *Income received / Expenses paid* are transactions dated in that month. Budgets and outstanding amounts come from the items.

Your example, verified by the test suite and the end-to-end test:

| | Nov | Dec |
|---|---:|---:|
| Bill | 6,000 | 6,500 |
| Paid in month | 4,000 | 5,000 |
| Carried in | — | 2,000 |
| Total due before payment | 6,000 | **8,500** |
| Allocation of the 5,000 | — | 2,000 → Nov, 3,000 → Dec |
| Remaining | 0 (settled in Dec) | **3,500** |

Duplicate protection: one-tap pay locks the category's items (`SELECT … FOR UPDATE`) and refuses when nothing is owed; every write carries an idempotency key (`client_ref`), so a double tap or a retried request records one payment.

---

## 1. Supabase setup

1. Create a project at [supabase.com](https://supabase.com) (any region; Singapore `ap-southeast-1` is closest to Dhaka).
2. Apply the schema — either:
   - **SQL editor:** open *SQL Editor → New query*, paste the contents of [`supabase/migrations/20261107000000_init.sql`](supabase/migrations/20261107000000_init.sql) and run it once; or
   - **CLI:** `npx supabase login && npx supabase init` (keep the existing `supabase/migrations` folder) → `npx supabase link --project-ref <ref>` → `npx supabase db push`.
3. **Authentication → URL Configuration**
   - *Site URL:* your production URL (e.g. `https://myfin.example.com`), or `http://localhost:3000` while developing.
   - *Redirect URLs:* add `http://localhost:3000/auth/callback` and `https://<your-domain>/auth/callback`.
4. **Authentication → Providers → Email:** keep enabled. "Confirm email" is recommended; sign-up then asks you to confirm before signing in. For a single-user app you can disable sign-ups after creating your account (*Authentication → Settings → Allow new users to sign up*).
5. Copy the keys from *Project Settings → API keys*: the **Project URL** and the **Publishable key** (`sb_publishable_…`; the legacy `anon` key also works). The service-role / secret key is **not** used by this app — never put it in the frontend.

Accounts created before the migration was applied get their defaults on first sign-in (`seed_my_defaults`).

Run **both** migration files, in order (`…_init.sql`, then `…_household.sql`).

### What the migrations create

- Tables: `profiles`, `user_settings`, `categories`, `payment_methods`, `recurring_rules`, `recurring_occurrences`, `monthly_budgets`, `obligations`, `transactions`, `payment_allocations`, `push_subscriptions`, `audit_log` — UUID keys, `created_at`/`updated_at`, all money as `NUMERIC(14,2)`.
- Views: `obligation_balances`, `obligation_status` (security-invoker, so RLS applies).
- RPCs: `ensure_month`, `record_payment`, `unmark_obligation`, `update_obligation_budget`, `copy_month_budget`, `restore_backup`, `seed_my_defaults`.
- Security: RLS on every table (`user_id = auth.uid()`); composite `(id, user_id)` foreign keys, so a row can never reference another user's data; allocations, occurrences and the audit log are read-only to clients; `anon` has no access.
- Audit: every insert/update/delete on transactions and obligations is recorded in `audit_log`.
- Household (`…_household.sql`): `households`, `household_members`, `household_items`, `shopping_requests`, `household_purchases`; RPCs `create_household`, `request_household_item`, `record_household_purchase`; server-only `household_add_member`, `find_user_id_by_email`, `ensure_month_for`. Members can only see their own household; nothing grants access to another member's finances. Household tables are added to Supabase Realtime for live list updates.

---

## 2. Environment variables

```bash
cp .env.example .env.local
```

| Variable | Value |
|---|---|
| `NEXT_PUBLIC_SUPABASE_URL` | `https://<project-ref>.supabase.co` |
| `NEXT_PUBLIC_SUPABASE_PUBLISHABLE_KEY` | `sb_publishable_…` (or set `NEXT_PUBLIC_SUPABASE_ANON_KEY` instead) |

| `SUPABASE_SECRET_KEY` | Server only. `sb_secret_…` from *API keys → Secret keys*. Needed for adding family members, push and the daily job. |
| `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT` | Web Push keys: `npx web-push generate-vapid-keys`. Without them, reminders fall back to showing when the app is opened. |
| `CRON_SECRET` | Random string; Vercel Cron sends it to `/api/cron/daily` (schedule in `vercel.json`). |

If the Supabase ones are missing, the app shows a setup page instead of crashing. `NEXT_PUBLIC_*` values are inlined into the browser bundle at **build** time — set them before `npm run build` / deploying, and rebuild after changing them.

---

## 3. Local development

Requires Node.js 20.9+ (tested on Node 24).

```bash
npm install
npm run dev            # http://localhost:3000
```

Useful scripts:

| Command | Does |
|---|---|
| `npm test` | 61 tests (incl. household sharing, privacy and purchases in PGlite, and the forecasting logic): database logic in real Postgres (PGlite, runs the actual migration — carry-forward, partial payments, duplicate protection, idempotency, recurrence, RLS isolation, backup round-trip) and the client calculations. |
| `npm run typecheck` / `npm run lint` | TypeScript and ESLint (incl. React Compiler rules). |
| `npm run build` | Production build. |
| `npm run assets` | Regenerates icons and iOS launch screens into `public/`. |
| `npm run mock` + `npm run dev:mock` | **No Supabase needed:** an in-memory Supabase stand-in running the real migration in PGlite, with any email/password accepted. Good for UI work and demos. |

End-to-end tests: `tests/e2e/household.cjs` (two iPhones, invite, instant push delivery to a local HTTPS sink, forecasts, cron) and the smoke test (iPhone 13 + desktop, 16 steps incl. the carry-forward example): start `npm run mock` and `npm run dev:mock`, then `npm i --no-save playwright && npx playwright install chromium && node tests/e2e/smoke.cjs`. Screenshots land in `.e2e-shots/`.

---

## 4. Install on iPhone / iPad

1. Open the deployed site in **Safari** (HTTPS is required for a PWA).
2. Tap **Share** → **Add to Home Screen** → **Add**.
3. Launch **myFin** from the Home Screen: it opens full-screen with its own icon and launch screen, safe-area aware, in portrait or landscape.
4. To get reminders: *Settings → Notifications → Enable reminders* (iOS 16.4+ supports notifications only for Home-Screen web apps).

This is a Progressive Web App installed from Safari, **not** an App Store app. See *Native iOS later* below.

---

## 5. Production deployment

**Vercel (recommended)**
1. Push this folder to a Git repository and import it in Vercel (framework: Next.js; no build settings needed).
2. Add the two environment variables for Production (and Preview if used).
3. Deploy, then add `https://<domain>/auth/callback` to Supabase redirect URLs and set the Site URL.

**Any Node host / Docker**
```bash
npm ci && npm run build && npm start   # serves on $PORT (default 3000)
```
Put it behind HTTPS. The app is static app shells + a small proxy (session refresh, sign-in redirect) + one route handler (`/auth/callback`); all data goes straight from the browser to Supabase under RLS.

**Before going live:** restrict sign-ups if it is just for you, enable leaked-password protection and (optionally) MFA in Supabase Auth, and schedule backups (*Settings → Data → Download backup*, or Supabase's own backups on paid plans).

---

## Household & notifications setup

1. Run `supabase/migrations/20261108000000_household.sql` in the Supabase SQL editor.
2. In Vercel → Settings → Environment Variables add `SUPABASE_SECRET_KEY`, `NEXT_PUBLIC_VAPID_PUBLIC_KEY`, `VAPID_PRIVATE_KEY`, `VAPID_SUBJECT`, `CRON_SECRET`, then redeploy. `vercel.json` registers the daily job (02:30 UTC = 08:30 Dhaka; Vercel Hobby runs it once a day within that hour).
3. In the app: **Household → Create household**, then **Settings → Household → Add family member** (name, email, a password you give them). The account is created by the server — no email link — and only shows the Household section.
4. On each iPhone: open the app from the Home Screen icon → **Settings → Notifications → Turn on notifications** (a test notification confirms it works). iOS needs 16.4+ and the Home Screen app.

How forecasts work: each purchase starts a "window" that ends at the next *running low* request (or the next purchase). Quantity ÷ days gives a usage rate (pooled over the last four windows), which projects the latest purchase forward to a run-out date. Items expected to run out within 3 days are suggested on the list (2 days for the morning alert). Logic: `src/lib/household/predict.ts` (unit-tested).

## Project structure

```
src/
  app/                      routes (static shells; data is fetched client-side)
    (app)/                  signed-in area: overview, budget, transactions, analytics, reminders, settings/*
    login/  auth/callback/  setup/  offline/  manifest.ts  layout.tsx  globals.css (design tokens, light/dark)
  proxy.ts                  Supabase session refresh + optimistic auth redirect
  components/
    ui/                     primitives: Button, Card, Field, Sheet (bottom sheet / dialog), Toast, PayCheck, Switch…
    shell/                  sidebar, bottom tab bar, month switcher, quick-add
    overview/ budget/ transactions/ charts/ settings/
  lib/
    finance/                pure, tested calculations (month summary, carry rows, yearly analytics)
    data/                   SWR hooks, mutations, error mapping, session/period context
    money.ts dates.ts       minor-unit money (no float drift), timezone-aware ISO dates
    notifications.ts        NotificationService interface + web implementation
    supabase/               browser & server clients
supabase/migrations/        schema, RLS, triggers and RPCs
scripts/                    PWA asset generator, mock Supabase server
tests/                      PGlite database tests, e2e smoke test
public/                     sw.js (service worker), icons, iOS launch screens
```

## Native iOS later (Capacitor)

The UI is fully client-rendered against Supabase, so it can be wrapped without changes:

1. `npm i @capacitor/core @capacitor/cli @capacitor/ios && npx cap init myFin com.example.myfin`
2. Point the shell at your deployed URL (`server.url` in `capacitor.config.ts`), or move to a static export if you want bundled assets (replace `/auth/callback` with a deep-link handler).
3. Native push: implement `NotificationService` (`src/lib/notifications.ts`) with `@capacitor/push-notifications`, store the APNs token via `savePushSubscription({ platform: "ios", endpoint: token })` (table `push_subscriptions`), and send from a Supabase Edge Function on a schedule. The service worker already handles Web Push `push` events for the PWA.

## Notes & limits

- Reminders are sent when the app is opened (local notifications). Delivering them while the app is closed needs a scheduled server sender (Web Push/APNs) — the table and service-worker handler are ready for it.
- Changing currency changes the symbol only; amounts are not converted.
- Recurring items are generated when a month is first opened (the current month is opened automatically). Months you never open aren't back-filled, so skipping months won't create surprise debts.
- Deleting an item keeps its payments in the ledger as unlinked transactions; categories in use can be archived but not deleted.
