# Security Implementation Notes

This document explains the security controls implemented in the backend and where they live.

## Authentication and Authorization

- JWT issuance and login flows:
  - `controllers/auth.controller.js`
- Token verification and role checks:
  - `middleware/auth.middleware.js`
- Cookie/session helpers:
  - `utils/cookies.js`

### Role model

- `users.role` is `user` or `admin`.
- Regular login (`/api/auth/login`) accepts both roles.
- Login sets an `HttpOnly` auth cookie (`AUTH_COOKIE_NAME`).
- `POST /api/auth/logout` clears the auth cookie.
- `GET /api/auth/me` reads auth from cookie first, then optional Bearer fallback.
- Super user uses the regular login flow and is identified by role.
- JWT includes `{ uid, role }`.

## Anonymous Identity Hardening

- Anonymous identity middleware:
  - `middleware/anon.middleware.js`
- Signed anon cookie logic:
  - `utils/anon.js`

Behavior:
- Anonymous identity is stored in a signed cookie (`ANON_COOKIE_NAME`).
- Client-provided anon headers are no longer trusted for identity.
- `X-Anon-Id` is still returned for UI display.

## Super Admin Bootstrap

- Bootstrap logic:
  - `services/bootstrapAdmin.service.js`
- Startup hook:
  - `server.js`

Behavior:
- Ensures `users.role` column exists.
- Enforces only one super user account: `Bot37`.
- If `ADMIN_PASSWORD` is configured:
  - Creates `Bot37` if missing.
  - Rotates `Bot37` password hash and enforces `role = admin`.

## CSRF and CORS

- CSRF middleware:
  - `middleware/csrf.middleware.js`
- CORS policy:
  - `app.js`

Behavior:
- CSRF token is issued via `/api/csrf-token`.
- CSRF response returns `{ csrfToken, csrfCookieName }`.
- Unsafe methods require `X-CSRF-Token` matching CSRF cookie.
- Unsafe requests are accepted only from configured origins.
- Cross-origin deployments should use `CSRF_COOKIE_SAME_SITE=none` with HTTPS.

## Error Exposure Controls

- Safe error helper:
  - `utils/security.js`
- Validation error detail toggle:
  - `middleware/validate.middleware.js`
  - `config/env.js` via `EXPOSE_VALIDATION_DETAILS`

Behavior:
- API responses are generic for internal failures.
- Detailed errors are logged server-side with trace IDs.
- Validation details can be hidden in production.

## Recommended Production Env Settings

- `NODE_ENV=production`
- `CORS_ORIGIN=https://<your-frontend-origin>`
- `CSRF_COOKIE_SAME_SITE=none`
- `CSRF_COOKIE_SECURE=true`
- `AUTH_COOKIE_SAME_SITE=none`
- `AUTH_COOKIE_SECURE=true`
- `AUTH_COOKIE_PARTITIONED=true`
- `TRUST_PROXY=true` (Render)
- `EXPOSE_VALIDATION_DETAILS=false`
- `ADMIN_PASSWORD=<long-random-password>`
