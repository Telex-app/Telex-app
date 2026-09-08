# Contributing to Telex

Thanks for taking the time to contribute. This document covers how to get the project running locally, the conventions we follow, and how to submit a change.

---

## Table of contents

- [Code of conduct](#code-of-conduct)
- [Getting started](#getting-started)
- [Development workflow](#development-workflow)
- [Commit messages](#commit-messages)
- [Pull request checklist](#pull-request-checklist)
- [Reporting bugs](#reporting-bugs)
- [Suggesting features](#suggesting-features)

---

## Code of conduct

This project follows our [Code of Conduct](CODE_OF_CONDUCT.md). By participating you agree to abide by its terms.

---

## Getting started

**Prerequisites:** Node 20 (see `.nvmrc`), npm, and Docker (or a local PostgreSQL instance).

```bash
# 1. Fork the repo and clone your fork
git clone https://github.com/<your-username>/Telex-app.git
cd Telex-app

# 2. Install dependencies
npm install

# 3. Start a local Postgres instance
docker compose up -d

# 4. Copy the example env and fill in the required values
cp apps/api/.env.example apps/api/.env

# 5. Apply the schema
npm run prisma:generate --workspace=apps/api
npm run prisma:deploy --workspace=apps/api

# 6. Start the API (port 3002) and front ends in separate terminals
npm run dev:api
npm run dev:landing   # port 3000
npm run dev:admin     # port 3001
```

---

## Development workflow

1. Create a branch from `main`:
   ```bash
   git checkout -b feat/your-feature-name
   ```
2. Make your changes and write or update tests.
3. Run the full test suite before pushing:
   ```bash
   npm test                          # API (node:test)
   npm run test:landing              # landing (Vitest)
   npm run lint                      # ESLint across all apps
   ```
4. Push your branch and open a pull request against `main`.

CI will run tests, lint, architecture checks, and secret scanning on every PR. All checks must pass before merging.

> **Note:** The CI job `api-test-coverage` will fail if you change files under `apps/api/src/**` without also touching `apps/api/test/**`. Add or update a test that exercises your change.

---

## Commit messages

We use [Conventional Commits](https://www.conventionalcommits.org/):

```
<type>(<scope>): <short summary>
```

Common types: `feat`, `fix`, `docs`, `chore`, `refactor`, `test`, `ci`.

Examples:
- `feat(payment): add retry logic to orchestrator`
- `fix(webhook): reject unsigned posts in development when secret is set`
- `docs: update quickstart for Windows users`

---

## Pull request checklist

- [ ] Tests added or updated for the change
- [ ] `npm test` and `npm run lint` pass locally
- [ ] No secrets or credentials committed (run `npm run secret-scan` to verify)
- [ ] PR description explains *what* changed and *why*
- [ ] Breaking changes are called out clearly

---

## Reporting bugs

Open an issue using the [Bug Report](.github/ISSUE_TEMPLATE/bug_report.yml) template. Include:

- Steps to reproduce
- Expected vs actual behaviour
- Node version, OS, and any relevant env settings (no secrets)

For security vulnerabilities, please see [SECURITY.md](SECURITY.md) — do **not** open a public issue.

---

## Suggesting features

Open an issue using the [Feature Request](.github/ISSUE_TEMPLATE/feature_request.yml) template. Describe the problem you are trying to solve and, if possible, a rough idea of how it might work.
