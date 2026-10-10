# Self Smart Checkout

Local Android-first hackathon prototype built with React Native, Expo Router, TypeScript, Express, and MongoDB. This repository is a native mobile app project; it is not a web-only React/Vite app.

## Phase 1 status

Phase 1 establishes the Expo Android app, Express API, and Mongoose database connection. The mobile foundation screen continues to check `/api/health`.

## Phase 2 status

The API supports customer-only self-registration, backend-role-based login, `/api/auth/me`, and server-revoked logout. Guard and Salesman accounts are provisioned by a backend-only seed command; public registration cannot assign staff roles. The mobile app stores the session in Android SecureStore and opens the protected Customer, Guard, or Store Admin portal using the authenticated account role.

Before starting the backend, copy `backend/.env.example` to `backend/.env` and set a development `JWT_SECRET`. Customers can register in the app. Staff cannot self-register.

### Development/demo staff account provisioning

`backend/src/scripts/seedAuthAccounts.ts` provisions one Guard and one Salesman through the existing backend-only `npm run seed:auth` command. This is a local development/demo mechanism, not a public API or production credential system. It requires the active shop to exist first. By default, the accounts are `guard@srhu.demo` and `admin@srhu.demo`, both assigned to `SHOP_001`.

Set `DEMO_GUARD_PASSWORD` and `DEMO_SALESMAN_PASSWORD` in `backend/.env` to separate development-only passwords (12–72 bytes each). You can also configure each account's name, email, and shop with `DEMO_GUARD_NAME`, `DEMO_GUARD_EMAIL`, `DEMO_GUARD_SHOP_ID`, and the corresponding `DEMO_SALESMAN_*` variables. The old `DEMO_ACCOUNT_PASSWORD` is supported only as an optional shared-password fallback. These values stay in the ignored local `.env`; never use demo credentials in production.

From the `backend` directory, create the demo shop and staff accounts:

```powershell
npm run seed:shop
npm run seed:auth
```

The seeder hashes staff passwords with bcrypt and refuses to change the role of any existing account. It will not promote a customer to Guard or Salesman. If an account already exists with the same staff role, rerunning the seed updates its configured shop/password and revokes its previous sessions. Sign in with the configured email/password; the account's backend role routes it to its portal.

To run the API auth flow check against the configured local MongoDB, run `npm run test:auth` from `backend`. It creates temporary test records and removes them when it completes.

## Phase 3 status

The customer portal scans a permanent Shop QR, verifies the shop with the backend, and starts an authenticated `ACTIVE` shopping session. The QR contains only a version, a type label, and a random opaque token; shop details are fetched from MongoDB after scanning. The app shows the verified shop before the customer confirms session creation.

Seed the demo shop and create its permanent QR image from `backend`:

```powershell
npm run seed:shop
```

This creates or reuses `SHOP_001` (SRHU Supermarket) in MongoDB and writes [the permanent Shop QR](backend/demo-data/SHOP_001-permanent-qr.png). The seed keeps the same permanent token on later runs. A signed-in salesman can also open **Permanent Shop QR** in the Store Admin portal to display the QR in the app. The demo admin account defaults to `admin@srhu.demo` and is linked to `SHOP_001` by the staff seed command.

For the mobile demo, start the API, seed the demo shop and staff account, then start Expo. Sign in as a customer, tap **Scan Shop QR**, scan the PNG displayed on another screen or printed copy, confirm the shop details, and tap **Start Shopping Session**. The customer home screen then shows the active session. On a physical Android phone, configure `EXPO_PUBLIC_API_URL` to the computer's LAN address as described below.

The Phase 3 API requires JWTs and server-side roles:

- `GET /api/shops/:shopId/qr` — SALESMAN; returns a QR image and public shop details.
- `POST /api/shops/identify` — CUSTOMER; resolves a scanned opaque token to public shop details.
- `POST /api/sessions` — CUSTOMER; creates an active session only when the shop ID and permanent QR token match.
- `GET /api/sessions/current` — CUSTOMER; returns the customer's latest active, exit-ready, or completed session and shop details.

Run the MongoDB-backed Phase 3 API flow check from `backend` with `npm run test:shop`. It covers the QR payload, role checks, valid and invalid shop identification, verified session creation, and session restoration. The test removes its temporary users, shop, and session.

## Phase 4 status

After starting a shopping session, the customer can scan EAN/UPC product barcodes or enter a barcode manually. Product lookups are scoped to the current authenticated session's shop. The customer can add available products to the session cart, change quantities, remove items, and see each line subtotal and the cart total. Stock is checked on lookup and every cart update; adding an item does not decrement inventory during this phase.

Seed 15 supermarket demo products after seeding the demo shop:

```powershell
npm run seed:products
```

The seed is repeatable and creates valid EAN-13 demo barcodes. It also creates [a printable barcode label sheet](backend/demo-data/SHOP_001-product-barcodes.html) for camera demos; open it on another screen or print it, then scan from the customer app. Tata Salt is intentionally seeded out of stock to demonstrate the unavailable state. The manual barcode field is available from **Scan Product Barcode**.

Phase 4 API routes require a CUSTOMER JWT and use the latest active session belonging to that authenticated customer:

- `GET /api/products/barcode/:barcode` — look up a product in the current session's shop, including its availability.
- `GET /api/sessions/current/cart` — read the session cart and totals.
- `POST /api/sessions/current/cart/items` with `{ "productId": "..." }` — add one unit, bounded by current stock.
- `PATCH /api/sessions/current/cart/items/:productId` with `{ "quantity": 2 }` — set quantity, bounded by current stock.
- `DELETE /api/sessions/current/cart/items/:productId` — remove a line.

Run `npm run test:cart` from `backend` for the MongoDB-backed product/cart flow check. It verifies barcode lookup, availability, role enforcement, quantity and total calculations, stock limits, shop scoping, and that separate customer sessions have separate carts. Test records are removed after the run.

## Phase 5 status

The customer cart can proceed to a checkout screen. The backend rechecks the active session's products, prices, and stock, then creates a customer/shop/session-linked `Order` in `PENDING_PAYMENT`. The order stores an item snapshot and a configurable subtotal, tax, discount, and final amount. Tax and discount are set in basis points with `CHECKOUT_TAX_RATE_BPS` and `CHECKOUT_DISCOUNT_RATE_BPS` (both default to `0`).

Payment is sandbox-only: the app offers explicit simulated success, failure, and cancellation outcomes. No provider is contacted, no card data is collected, and no live payment key is used. Set `PAYMENT_MODE=sandbox` in `backend/.env`; if sandbox mode is disabled, payment attempts are rejected. Failed and cancelled orders stay unpaid and can be retried. A successful response marks the order `PAID` and session `READY_FOR_EXIT`.

Phase 5 APIs require a CUSTOMER JWT:

- `POST /api/sessions/current/checkout` — validate the active session's cart/stock and create or resume its pending order.
- `GET /api/orders/:orderId/payment` — read payment state for an order owned by the signed-in customer.
- `POST /api/orders/:orderId/payment` with `{ "outcome": "SUCCESS" | "FAILED" | "CANCELLED" }` — record a sandbox outcome. Only `SUCCESS` marks the order paid and moves the session to `READY_FOR_EXIT`.

Run `npm run test:checkout` from `backend` to verify order persistence and totals, role/owner checks, cart locking, failed/cancelled retries, checkout stock validation, payment-time stock validation, and the successful `READY_FOR_EXIT` transition. The test uses temporary MongoDB records and removes them afterward.

## Phase 6 status

Successful sandbox payment creates one expiring Exit Pass. Its QR contains only a random opaque token; MongoDB stores a SHA-256 token hash and an AES-GCM encrypted copy so the owning customer can reopen the pass. The encryption key is derived from `JWT_SECRET`. `EXIT_PASS_TTL_MINUTES` controls validity (default 15 minutes; allowed 1–1440). Expired records are marked `EXPIRED` when checked, so they remain available for status/history checks.

Customers can open **Exit Pass** from the payment success screen or customer home. Guards assigned to a shop can scan with the camera and see the paid order details, including product image, product name, quantity, unit price, line subtotal, item count, total paid, payment status, order ID, and shop name. The prominent **VERIFY ITEMS BEFORE APPROVING EXIT** section tells the guard to physically compare the displayed order with the customer's items; the app does not visually inspect bags. The guard can choose **ITEMS VERIFIED — APPROVE EXIT** or **MISMATCH / CHECK REQUIRED** and record a reason. Approval atomically consumes the pass, records the guard and verification time, and completes the session. A check-required pass records its guard, time, and reason, keeps the session ready for exit and the customer's QR available, and remains open for further inspection. After checking the items, a guard can rescan and approve if the paid order matches. Invalid, expired, unpaid, failed, cancelled, wrong-shop, and used passes cannot be approved.

Run `npm run seed:auth` after configuring `backend/.env` to assign the demo Guard and Salesman accounts to their configured active shops. Phase 6 APIs enforce CUSTOMER and GUARD roles server-side:

- `GET /api/customer/exit-passes/orders/:orderId` — CUSTOMER; returns the owner's paid order summary and active QR image.
- `POST /api/guard/exit-passes/verify` with `{ "token": "..." }` — GUARD assigned to the pass's shop; validates and returns the transaction summary.
- `POST /api/guard/exit-passes/check-required` with `{ "token": "...", "reason": "..." }` — GUARD; records the manual item check requirement without completing the session or consuming the pass.
- `POST /api/guard/exit-passes/approve` with `{ "token": "..." }` — GUARD; consumes a valid pass and moves its session to `COMPLETED`.

Run `npm run test:exit-pass` from `backend` to verify payment-triggered QR creation, customer ownership, guard roles/shop scope, invalid and expired tokens, unpaid/failed/cancelled orders, paid order details, CHECK_REQUIRED audit/session behavior, later inspection and approval, one-time approval, and QR reuse prevention. Phase 2–5 checks remain available as `test:auth`, `test:shop`, `test:cart`, and `test:checkout`.

## Phase 7 status

The backend runs a modular, transparent rule-based anomaly assessment after a successful payment and Exit Pass creation. The current `transparent-rules-v1` detector checks paid-order status, cart/order item consistency, item and transaction totals, duplicate product lines, unusually high quantities, and current recorded stock. It stores one immutable `AiVerification` record per order with `VERIFIED` or `CHECK_REQUIRED`, a score from 0–100, human-readable reasons, and the ruleset version. Scores of 40 or higher are labeled `CHECK_REQUIRED`. This is a prototype rules engine, not a trained production model.

The protected guard Exit QR verification response includes the saved result. The customer Exit Pass response does not expose it. AI is decision support based only on transaction and inventory data: it does not inspect physical bags, change the Exit Pass state, approve an exit, or replace the guard's physical comparison. The existing **ITEMS VERIFIED — APPROVE EXIT** and **MISMATCH / CHECK REQUIRED** actions remain the only guard decisions. If the assessment service is temporarily unavailable, payment and the guard's transaction review continue; the guard sees that no assessment is available and still performs the manual comparison.

Run `npm run test:exit-pass` from `backend` to exercise persisted normal and suspicious results, guard-only access, scoring reasons, and the fact that an AI `CHECK_REQUIRED` result does not approve or consume the Exit Pass.

## Phase 10 status

Sensitive APIs reject missing, malformed, expired, or stale JWTs, and the backend reloads the user role and token version on each authenticated request. Customer registration always creates a CUSTOMER; staff roles cannot be supplied through that endpoint. Login uses bcrypt and performs a dummy bcrypt comparison for unknown email addresses. Admin product/order lookups, customer-owned order/pass reads, and guard Exit Pass actions are scoped on the server to the authenticated user or assigned shop.

The API limits JSON request bodies to 32 KB, restricts browser CORS to `CORS_ORIGINS` (local Expo web origins by default; native Android requests without an Origin header are allowed), returns safe client errors for malformed JSON, validation/cast, oversized-body, and duplicate-key failures, and avoids returning internal stack traces. Product/shop/order IDs, barcodes, quantities, product prices/stock, and sandbox payment outcomes are validated. Sandbox payment only transitions an owned, test-mode order after backend cart and inventory revalidation; client-provided payment status fields are not accepted. Inventory reservation is atomic and guarded against double deduction. Exit tokens remain random opaque bearer tokens, hashed for lookup and encrypted at rest; guard approval is atomic and one-time.

Login, registration, order payment/status, and guard Exit QR endpoints have lightweight IP-based fixed-window rate limits. These buckets are process-local, so they reset when the API restarts and are not shared across multiple API instances; production deployment would need a shared rate-limit store and a trusted proxy configuration. The checked-in `backend/.env.example` contains placeholders only. Keep the real `backend/.env` local (it is excluded by `.gitignore`) and replace `JWT_SECRET` with a random secret before exposing the API outside a local demo.

Run `npm run test:security` from `backend` for malformed/expired JWTs, role and shop boundaries, invalid IDs and cart quantity, payment-status injection, malformed/oversized JSON, safe error responses, and sensitive-route rate limits. The full regression set is `test:auth`, `test:shop`, `test:cart`, `test:checkout`, `test:exit-pass`, `test:admin`, `test:e2e`, and `test:security`.

## Setup, local Android testing, and demo flow

### Project structure and requirements

- `mobile/` — Expo Router, React Native, TypeScript Android application.
- `backend/` — TypeScript, Express, Mongoose API and backend-only seed/check scripts.
- `ai/` — reserved project module; the current transparent anomaly rules live in `backend/src/ai/`.
- Requirements: Node.js 20.19+ (Node 24 is also suitable), npm, MongoDB, and Expo Go or an Android emulator.

Install dependencies once in each project:

```powershell
cd backend
npm install
cd ..\mobile
npm install
```

### Environment and MongoDB

Start MongoDB Community Server locally, or provide a MongoDB URI through the backend environment. Copy `backend/.env.example` to `backend/.env`; the example points to a local development database and contains no real secrets. Configure a private random `JWT_SECRET` of at least 32 characters. The other backend settings cover `PORT`, `CORS_ORIGINS`, sandbox payment, checkout tax/discount, Exit Pass lifetime, and development-only staff seed accounts. Keep `.env` files private and out of source control.

For production, supply `NODE_ENV=production`, `MONGODB_URI`, and `JWT_SECRET` through the deployment secret/environment manager. `CORS_ORIGINS` is only needed for browser clients; native Android requests do not send an `Origin` header. If set in production, it must contain the exact HTTPS origin(s) of the browser frontend. Production startup rejects missing or unsafe settings and refuses demo staff passwords. Use a managed/private MongoDB deployment with backups and network restrictions. Never place backend secrets in Expo variables.

Model-declared unique indexes include user email, shop ID and permanent QR token, product ID and shop/barcode, session ID, order ID and pending-session constraint, Exit Pass identifiers/token hash, and AI verification IDs. Before deployment, run `npm run db:indexes` from `backend` to create declared indexes without dropping existing indexes or deleting documents. If index creation reports duplicates, inspect and resolve those records before deployment; this command does not remove data.

### Start the backend

```powershell
cd backend
npm run dev
```

The API listens on port `4000` by default. `GET /api/health` is a safe liveness response; `GET /api/health/ready` returns HTTP 200 only when MongoDB is connected, otherwise HTTP 503. Neither endpoint returns credentials or user data.

### Render backend deployment preparation

The repository includes a Render Blueprint at [render.yaml](render.yaml). It configures the monorepo service root as `backend`, installs from the backend lockfile, compiles TypeScript, starts the compiled Express server, and uses `/api/health/ready` for database-backed readiness. Automatic deploys are disabled in the Blueprint so connecting the repository does not publish every subsequent commit without an explicit dashboard change. The service is configured on Render's free plan for the hackathon prototype; free instances can sleep and have cold starts.

To deploy, first push this repository to a GitHub repository you control, then in Render choose **New → Blueprint**, connect that repository, and review the detected service before creating it. Render will ask for the private `MONGODB_URI`; paste it directly into Render's secret field. The Blueprint generates `JWT_SECRET`. It sets `NODE_ENV=production`, `PAYMENT_MODE=sandbox`, and the Node runtime. Do not add demo password variables. No `PORT` value is needed: Render supplies it, and the API listens on `0.0.0.0`.

Before creating the Blueprint, ensure MongoDB Atlas has a dedicated application database user and that its network access rules allow connections from the Render service. Prefer a restricted allowlist based on the outbound IPs for the selected Render region/plan or a private networking option supported by your setup; do not broadly allow every IP as a permanent rule. Do not put database credentials in GitHub, this file, mobile Expo variables, or chat. `CORS_ORIGINS` can be omitted for native Android; if a browser client is later deployed, set only its exact HTTPS origin(s). The backend rejects demo staff passwords in production.

After creation, wait for the deployment to become healthy and verify `https://<render-service-domain>/api/health` and `/api/health/ready`. Readiness must return HTTP 200 and `database: "connected"`. If readiness fails, inspect Render's server logs for the safe error category and check the private environment variables and Atlas network access. The app does not automatically seed records in production; run any future seed as a trusted one-off operator task, never by adding demo credentials to the long-running service.

The Render Node service receives a single-instance local rate-limit bucket. Keep it to one instance for the prototype; before scaling horizontally or treating this as production, replace the process-local limiter with shared storage and configure Express to trust only the verified Render proxy path. Do not enable broad proxy trust without confirming the hosting topology.

Seed the demo shop/products and provision staff accounts from `backend/.env`:

```powershell
npm run seed:shop
npm run seed:products
# Set DEMO_GUARD_PASSWORD and DEMO_SALESMAN_PASSWORD locally before running:
npm run seed:auth
# Optional paid/pending/failed/cancelled transaction fixtures and temporary Exit QRs:
npm run seed:exit-tokens
```

Set different demo passwords in the ignored `backend/.env`; they are never stored in this README or bundled in the app. Customer accounts register in the app and can only receive the `CUSTOMER` role. Backend-provisioned `GUARD` and `SALESMAN` accounts are linked to a shop. Each role routes to its own portal, and APIs enforce role and shop access on the server.

The generated Exit QR images and printable sheet contain short-lived bearer tokens, so their local output directory is ignored by source control. Do not share or commit those files; regenerate them for a demo when needed.

### Start Expo and test on Android

For Expo Go on a physical phone, copy `mobile/.env.example` to `mobile/.env` and set `EXPO_PUBLIC_API_URL` to `http://<laptop-LAN-IP>:4000`. This API URL is public app configuration, not a secret. The phone and laptop must be reachable on the same network. The backend binds to all interfaces; allow port 4000 through the laptop firewall for the local demo. In Expo Go development, if no URL is configured, the app continues to derive the Expo LAN host (or emulator fallback). A standalone release build requires an explicit API URL and does not silently target `10.0.2.2`.

```powershell
cd mobile
npx expo start
```

Press `a` for an Android emulator, or open the Expo Go QR code on a physical Android phone. The Android package ID is `com.srhutech.selfsmartcheckout`; the existing app icon, adaptive icon, splash screen, and Expo Camera plugin remain configured. Expo Camera adds Android camera permission for QR/barcode scanning, and audio recording is disabled.

The demonstration path is: customer registers/logs in → scans permanent Shop QR → scans products → edits cart → checks out with sandbox payment → shows the paid Exit QR. A shop-assigned guard scans the pass, reviews the paid cart and AI decision-support result, physically compares the items, then approves or marks a check required. The salesman portal shows shop-scoped inventory, sales, transactions, and flagged checks. AI does not inspect bags or approve exits, and payment remains simulated; this prototype is not configured to accept real money.

The API's current rate limiter is process-local. It is appropriate for this single-process prototype but must be replaced with a shared store and trusted-proxy configuration before horizontal scaling. Do not expose the development server, demo accounts, sandbox payment, or unencrypted local API URL as a production service.

## Android package build (Phase 14)

The EAS profiles are configured for an internal preview APK and production Android App Bundle. Both profiles use the EAS `production` environment so the standalone bundle receives its API address at build time. After deploying the backend, open the Expo project's **Environment variables** settings and add `EXPO_PUBLIC_API_URL` to the **production** environment as a plain text value, using the backend's public HTTPS origin (for example, `https://api.your-domain.com`). This URL is bundled into the app and is public configuration; never put secrets in it. Expo Go local development keeps its current LAN-host fallback when no URL is configured. APK generation is intentionally deferred to Phase 14. From `mobile/`, create the APK with `npx eas-cli@latest build --platform android --profile preview` after the production URL and EAS credentials are configured.

## Project layout

```text
mobile/    Expo Router + React Native Android app
backend/   TypeScript Express API, Mongoose models, services, scripts
ai/        Root-level reserved module
```
