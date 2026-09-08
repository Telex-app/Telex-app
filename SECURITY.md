# Security Policy

## Supported versions

| Version | Supported |
|---------|-----------|
| `main`  | Yes       |

## Reporting a vulnerability

**Please do not open a public GitHub issue for security vulnerabilities.**

If you discover a security issue, report it privately by emailing the maintainers or opening a [GitHub Security Advisory](https://github.com/Telex-app/Telex-app/security/advisories/new).

Include as much detail as possible:
- A description of the vulnerability
- Steps to reproduce or a proof-of-concept
- Potential impact
- Any suggested mitigations

You will receive an acknowledgement within **48 hours** and a resolution timeline within **7 days**. We ask that you give us reasonable time to address the issue before any public disclosure.

## Known security considerations

- Wallet private keys are encrypted with AES-256-GCM. The server will not start without a valid `ENCRYPTION_KEY`.
- Webhook endpoints are verified per transport (HMAC for Meta, secret token + enforced TLS for Telegram) and fail-closed in production.
- The unauthenticated REST wallet and compliance endpoints are disabled in production by default (`ENABLE_WALLET_REST_API`).
- Admin routes require HMAC-signed session tokens.

See the [Security posture](README.md#security-posture) section of the README for a full overview.
