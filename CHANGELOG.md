# Changelog

All notable changes to Telex will be documented in this file.

The format is based on [Keep a Changelog](https://keepachangelog.com/en/1.0.0/).

---

## [Unreleased]

### Added
- Telegram transport: `Update` normalizer, identity bridge (`TelegramLink`), webhook secret verification
- Shared inbound pipeline with dedupe, per-sender throttling, message ordering, and BullMQ enqueue
- Conversation agent: intent parsing, recipient resolution, pending claims, PIN confirmation flow
- Payment orchestrator with KYC tiers, per-transaction and daily limits, risk scoring
- Stellar adapter (`stellar.adapter.js`) as the single chokepoint for all key handling
- AES-256-GCM encryption for Stellar wallet private keys
- SEP-10 application sessions for authenticated wallet REST routes
- Admin operator dashboard with cursor-paginated endpoints for users, wallets, transactions, KYC, and audit logs
- Compliance module: KYC tiers, PIN service, consent categories, privacy/erasure lifecycle
- BullMQ workers for inbound messaging, deposits, notifications, audit, and retention jobs
- Prometheus metrics (`telex_*` prefix) and Grafana dashboard in `observability/`
- OpenAPI 3.0 specification at `apps/api/openapi.json`
- Chat simulator transport (`MESSAGE_TRANSPORT=sim`) for local development without WhatsApp
- React + Vite landing page and admin dashboard
- Expo/React Native chat simulator app (`apps/chat-sim`)
- Architecture test that walks the require graph and rejects circular dependencies or imports outside `src/`

### Security
- Webhook fail-closed in production: HMAC body signature for Meta, bearer token + enforced TLS for Telegram
- Inbound idempotency to prevent duplicate transfers on provider retries
- PostgreSQL-backed shared rate limiting (per-IP on REST, per-sender on webhooks)
- Admin routes behind HMAC-signed, expiring session tokens
- CORS restricted to an allowlist in production

---

*This project follows [Semantic Versioning](https://semver.org/). A `1.0.0` release will be tagged when the system is cleared for real-money operation.*
