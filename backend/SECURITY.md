# Security Threat Model

## Primary threats considered
- XSS through thread titles or post content.
- CSRF on state-changing endpoints (`POST /api/*`).
- Credential abuse and brute-force on auth endpoints.
- Spam floods and duplicate content posting.
- Resource abuse through high-volume API scraping.

## Mitigations implemented
- Input validation and sanitization:
  - Schema validation in `middleware/validate.middleware.js`.
  - Content normalization in `utils/sanitize.js`.
- Safe rendering in client UI:
  - Thread/post UI is rendered via DOM APIs and `textContent` (no unsafe HTML injection).
- CSRF protection:
  - Double-submit cookie token via `/api/csrf-token`.
  - Required `X-CSRF-Token` header for all unsafe API methods.
  - Cross-site fetch-site check blocks `sec-fetch-site: cross-site`.
- Rate limits:
  - Per-endpoint limits with IP/identity keys via `middleware/rateLimit.middleware.js`.
- Spam guard:
  - Post/thread cooldown and duplicate-content rejection via `middleware/abuse.middleware.js`.
- Transport/security headers:
  - `helmet()` enabled and `x-powered-by` disabled.

## Residual risks
- In-memory limiters and spam state are per-process only; use Redis for multi-instance deployments.
- No CAPTCHA or email verification; bot resistance is moderate.
- No moderation queue/content classification; abusive text can still be posted.
- No full audit logging or SIEM pipeline.

## Recommended next hardening steps
1. Move rate-limit + spam state to Redis.
2. Add structured audit logs (auth failures, 429 events, CSRF failures).
3. Add pagination and strict max page sizes for list endpoints.
4. Add a moderation/report workflow and optional keyword/URL heuristics.
