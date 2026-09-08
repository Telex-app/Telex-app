# Telex

**Send money like you send a text.** Telex gives a phone number a Stellar wallet and drives it from a chat conversation, so people can be paid on the number their contacts already have for them.

No app to install, no seed phrase, no wallet address. A user types `send 25000 to 08012345678` or records a voice note, confirms with a PIN, and the payment settles on Stellar.

> **Status: pre-production.** The architecture, compliance model and transport layer are built and tested. Real money movement still needs provider credentials, a KYC integration, monitoring, and compliance review. See [Before a real-money launch](#before-a-real-money-launch).

---

## How it works

```mermaid
flowchart LR
    TG["Telegram<br/>Bot API"] --> N["normalizer<br/>Update to internal shape"]
    WA["WhatsApp<br/>Cloud API"] --> V["Meta envelope<br/>validator"]

    N --> P
    V --> P

    P["Shared inbound pipeline<br/>dedupe · throttle · order · enqueue"] --> Q[("BullMQ<br/>messaging-inbound")]
    Q --> A["Conversation agent<br/>intent · quote · PIN"]
    A --> O["Payment orchestrator<br/>limits · risk · fees"]
    O --> S(["Stellar<br/>settlement"])
    O --> R["Receipt + notification<br/>back to the chat"]
```

The load-bearing idea: **one pipeline, two transports.** A Telegram `Update` is reshaped into the same payload the WhatsApp Cloud API delivers, then handed to the shared inbound path. Idempotency, per-sender throttling, message ordering and the claim/release state machine are shared rather than reimplemented per transport.

---

## The two transports

Set `MESSAGE_TRANSPORT` to `telegram`, `meta`, or `sim`. Both real transports run against the same conversation and payment code.

|  | Telegram | WhatsApp (Meta) |
|---|---|---|
| **Identity** | `chat_id`, so onboarding asks for a verified contact share | phone number arrives on the webhook |
| **Authenticity** | `X-Telegram-Bot-Api-Secret-Token`, a shared secret | `X-Hub-Signature-256`, an HMAC over the body |
| **Delivery receipts** | none — `sent` is terminal | sent → delivered → read callbacks |
| **Proactive messages** | always allowed | blocked after 24h without an approved template |
| **Voice media** | `getFile`, then the file host | Graph API media URL |

### Identity is always a phone number

Everything in Telex — wallets, recipient resolution, pending claims, KYC — is keyed on an E.164 phone number. Telegram never volunteers one, so onboarding opens with a **Share phone number** keyboard button and Telegram returns a verified number. That pair is stored in `TelegramLink`, the single place the two namespaces meet.

A link is written **only** when `contact.user_id` matches the sender. Anyone can forward a third party's contact card through the same field, and trusting it would let an attacker bind someone else's number to their chat. Until a chat is linked, nothing it sends is enqueued.

---

## Repository layout

```text
apps/
  api/        Express API + BullMQ worker (Node, CommonJS)
  landing/    Public site — Vite + React + Tailwind
  admin/      Operator dashboard — Vite + React
  chat-sim/   Expo/React Native chat simulator for local development
packages/
  shared/     Shared frontend components
observability/  Prometheus rules + Grafana dashboard
```

Inside `apps/api/src`:

| Directory | Responsibility |
|---|---|
| `conversation/` | Transport-agnostic agent: intent parsing, recipient resolution, pending claims |
| `telegram/` | Telegram specifics: `Update` normalizer, identity bridge, validator |
| `whatsapp/` | Meta specifics: `whatsapp_business_account` envelope validator |
| `services/` | `messaging.service` (outbound, all transports), `telegram.service`, receipts, auth, crypto |
| `payment/` | Orchestrator, ledger, state transitions, reconciler |
| `wallet/` | Stellar adapter and wallet lifecycle. **Only `stellar.adapter.js` imports the Stellar SDK** |
| `compliance/` | KYC tiers, limits, PIN, risk scoring, privacy/erasure |
| `pricing/` | FX quotes and policy conversion |
| `queues/`, `jobs/` | BullMQ processors, ordering, dead-letter handling |
| `observability/` | Metrics, health, dependency checks, queue alerting |

---

## Quickstart

**Prerequisites:** Node 20 (see `.nvmrc`), npm, and either Docker or a PostgreSQL connection string.

```bash
npm install
```

Start a local Postgres (no cloud account needed):

```bash
docker compose up -d
```

Then in `apps/api/.env` — copy `apps/api/.env.example` first, it is the source of truth:

```env
DATABASE_URL=postgresql://telex:telex@localhost:5432/telex
```

Drop `sslmode=require` from the example placeholder; the local container doesn't use SSL.

Apply the schema and run the API:

```bash
npm run prisma:generate --workspace=apps/api
npm run prisma:deploy --workspace=apps/api
npm run dev:api
```

Run the front ends in separate terminals:

```bash
npm run dev:landing   # http://localhost:3000
npm run dev:admin     # http://localhost:3001
```

The API listens on **3002**.

> The root `npm run dev` chains the three with `&`, which backgrounds them on POSIX shells but runs them **sequentially** on Windows `cmd`. On Windows, use separate terminals.

---

## Connecting Telegram

1. Create a bot with [@BotFather](https://t.me/BotFather) and copy the token.
2. In `apps/api/.env`:

   ```env
   MESSAGE_TRANSPORT=telegram
   TELEGRAM_BOT_TOKEN=<from BotFather>
   TELEGRAM_WEBHOOK_SECRET=<32+ random characters>
   TELEGRAM_CALLBACK_URL=https://<your-host>/webhook/telegram
   ```

3. Register the webhook:

   ```bash
   npm run telegram:webhook:configure --workspace=apps/api
   ```

   Pass `-- --info` to print the current registration and Telegram's last delivery error, or `-- --delete` to unregister it.

Telegram requires HTTPS, so use a tunnel (ngrok, Cloudflare Tunnel) for local testing.

**Security note:** Telegram's secret token does not sign the request body, so it is a bearer credential — anyone who observes one request could replay forged updates. The webhook therefore refuses plaintext transport in production, and the value accepts a comma-separated list so it can be rotated the same way `WHATSAPP_APP_SECRET` is.

For the landing page CTAs, set `VITE_TELEGRAM_BOT` in `apps/landing/.env` to the bot handle without the `@`.

---

## HTTP surface

```text
POST /webhook/telegram        Telegram updates (secret-token verified)
GET  /webhook/telegram        Liveness probe — reports transport, never secrets
GET  /webhook                 Meta verification challenge
POST /webhook                 Meta updates (X-Hub-Signature-256 verified)

POST /api/auth/*              SEP-10 application sessions
GET  /api/receipts/:id        Public receipt verification
POST /api/pricing/quote
     /api/compliance/*        KYC, PIN, consent, privacy requests
     /api/admin/*             Operator endpoints (requireAdmin)
     /api/wallet/*            SEP-10 authenticated; off unless ENABLE_WALLET_REST_API
     /api/sim/*               Chat simulator; off unless ENABLE_CHAT_SIM

GET  /health/live             Process liveness
GET  /health/startup          Readiness, including the database link
GET  /health/network          Stellar network reachability
GET  /metrics                 Prometheus scrape (METRICS_TOKEN)
```

Metrics are prefixed `telex_`. `observability/` ships matching Prometheus rules and a Grafana dashboard.

---

## Testing

The API uses Node's built-in `node:test` — no test framework dependency. The front ends use Vitest.

```bash
npm test              # API suite
npm run test:landing  # landing (Vitest + jest-axe)
npm run lint          # api + landing + admin
```

Two suites are worth calling out because they guard things review tends to miss:

- **`test/architecture.test.js`** walks the require graph and fails if any file in `src/` imports from outside `src/`, or if a circular dependency appears. Production code once imported its PII-redaction helper from `test/`, which would have broken any build that shipped only `src/`.
- **`test/jobs.module.test.js`** requires the real worker entrypoint unmocked. The worker was once a hard syntax error while the suite stayed green, because the lifecycle tests mock the module.

CI also fails a PR that touches `apps/api/src/**` without touching `apps/api/test/**` (the `api-test-coverage` job in `.github/workflows/ci.yml`). It is a deliberately crude heuristic that maintainers can override.

---

## Deployment

**Front ends** are static Vite builds — any static host works. Build with `npm run build:landing` / `npm run build:admin`; output lands in `apps/<app>/dist`. `VITE_*` variables are read at build time.

**The API is a long-running Express server**, so it needs a persistent Node host (Render, Railway, Fly.io, a VM) rather than serverless functions. The webhook acknowledges the provider immediately and finishes the work on a queue; a function that freezes after responding would drop it.

Checklist:

- Provision PostgreSQL, set `DATABASE_URL`, run `npm run prisma:deploy --workspace=apps/api`.
- Set every required variable. The server **fails fast at startup** without `ENCRYPTION_KEY`, `JWT_SECRET` and `ADMIN_PASSWORD`, and rejects unsigned webhooks in production.
- Set `NODE_ENV=production` and a `CORS_ORIGINS` allowlist covering the deployed URLs.
- Point the host's health check at **`GET /health/startup`**.
- Run the worker as a **separate process** from the API (`npm run dev:worker` locally; its own service in production).

---

## Security posture

Already in place:

- Wallet keys encrypted with authenticated **AES-256-GCM**; the server refuses to start without a valid `ENCRYPTION_KEY`.
- Only `wallet/stellar.adapter.js` touches the Stellar SDK, so key handling has one chokepoint.
- Webhooks verified per transport, **fail-closed in production**: HMAC body signature for Meta, secret token plus enforced TLS for Telegram.
- Inbound idempotency, so a provider retry cannot move money twice.
- KYC tiers with per-transaction and daily limits, enforced on every payment by the orchestrator.
- Admin routes behind HMAC-signed sessions and `requireAdmin`.
- PostgreSQL-backed rate limiting shared across instances: per-IP on REST, per-sender on the webhook.
- Dead-letter records redacted before operators see them.
- CORS restricted to an allowlist in production.

### Before a real-money launch

- Replace the single static `ENCRYPTION_KEY` with managed KMS/HSM key handling and rotation.
- Replace the shared admin password with real accounts and roles.
- Wire production KYC callbacks (Smile ID or Dojah).
- Add monitoring, alerting and an audit-review workflow.
- Broaden coverage of the payment orchestrator, voice and compliance paths.
- Complete legal, compliance, AML and custody review.

---

## License

MIT — see [`LICENSE`](LICENSE).
#   T e l e x - a p p  
 