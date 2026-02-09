# Security Implementation Notes

This document explains the security controls implemented in the backend and where they live.

## Authentication and Authorization

- JWT issuance and login flows:
  - `controllers/auth.controller.js`
- Token verification and role checks:
  - `middleware/auth.middleware.js`
- Admin-only API surface:
  - `routes/admin.routes.js`
  - `controllers/admin.controller.js`

### Role model

- `users.role` is `user` or `admin`.
- Regular login (`/api/auth/login`) accepts both roles.
- Super-admin login (`/api/auth/admin/login`) requires `role = admin`.
- JWT includes `{ uid, role }`.

## Super Admin Bootstrap

- Bootstrap logic:
  - `services/bootstrapAdmin.service.js`
- Startup hook:
  - `server.js`

Behavior:
- Ensures `users.role` column exists.
- If `ADMIN_USERNAME` and `ADMIN_PASSWORD` are configured:
  - Creates admin if missing.
  - Rotates password hash and enforces `role = admin` if user exists.

## CSRF and CORS

- CSRF middleware:
  - `middleware/csrf.middleware.js`
- CORS policy:
  - `app.js`

Behavior:
- CSRF token is issued via `/api/csrf-token`.
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
- `EXPOSE_VALIDATION_DETAILS=false`
- `ADMIN_USERNAME=<secure-admin-username>`
- `ADMIN_PASSWORD=<long-random-password>`
