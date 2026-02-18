# Let's Discuss

Let's Discuss is a full-stack anonymous forum application.
It includes a static frontend (`docs/`) and a Node.js + Express + PostgreSQL backend (`backend/`).

## Overview

- Anonymous and authenticated posting
- Thread-based discussions with replies
- Public activity stats
- Personal dashboard summary (for both guest identity and signed-in users)
- Security controls: CSRF protection, cookie auth, rate limits, spam guard, input validation

## Tech Stack

- Frontend: HTML, CSS, Vanilla JavaScript (PWA-ready static site in `docs/`)
- Backend: Node.js, Express
- Database: PostgreSQL
- Auth/Security: JWT, HttpOnly cookies, Helmet, CORS, CSRF tokens

## Project Structure

```text
.
├── backend
│   ├── app.js
│   ├── server.js
│   ├── config/
│   ├── controllers/
│   ├── middleware/
│   ├── routes/
│   ├── services/
│   ├── sql/schema.sql
│   └── .env.example
└── docs
    ├── index.html
    ├── home.html
    ├── login.html
    ├── dashboard.html
    ├── dashboard-user.html
    ├── thread.html
    ├── runtime-config.js
    └── js/, css/, assets/
```

## Local Setup

### Prerequisites

- Node.js 18+ (recommended)
- npm
- PostgreSQL 13+ (with `uuid-ossp` extension available)

### 1) Clone and install backend dependencies

```bash
git clone <your-repo-url>
cd "Assignment - I/backend"
npm install
```

### 2) Create the database

Example with `psql`:

```sql
CREATE USER discuss_user WITH PASSWORD 'replace_with_strong_password';
CREATE DATABASE lets_discuss OWNER discuss_user;
```

### 3) Apply schema

From the repository root:

```bash
psql "postgres://discuss_user:replace_with_strong_password@localhost:5432/lets_discuss" -f backend/sql/schema.sql
```

### 4) Configure backend environment

```bash
cp backend/.env.example backend/.env
```

Update at least these values in `backend/.env`:

- `DATABASE_URL`
- `JWT_SECRET` (must be at least 32 characters)
- `ANON_COOKIE_SECRET` (must be at least 32 characters)
- `DB_SSL=false` for most local PostgreSQL setups
- `CORS_ORIGIN=http://localhost:5500,http://127.0.0.1:5500`

Optional:

- `ADMIN_PASSWORD` to rotate/set the `Bot37` admin password on startup (min 14 chars)

### 5) Start backend

```bash
cd backend
npm run dev
```

Backend runs on `http://localhost:4000` by default.

### 6) Serve frontend (`docs/`)

From repository root:

```bash
python3 -m http.server 5500 --directory docs
```

Open `http://localhost:5500`.

`docs/runtime-config.js` already points local frontend to `http://localhost:4000`.

## Backend Scripts

In `backend/package.json`:

- `npm run dev`: Run with nodemon
- `npm start`: Run with node

## API Quick Reference

Base URL (local): `http://localhost:4000`

| Method | Endpoint | Description |
|---|---|---|
| GET | `/health` | Health check |
| GET | `/api/csrf-token` | Issue CSRF token + cookie |
| POST | `/api/auth/register` | Register user |
| POST | `/api/auth/login` | Login user |
| GET | `/api/auth/me` | Current user |
| POST | `/api/auth/logout` | Logout user |
| GET | `/api/stats` | Public stats |
| GET | `/api/threads` | List threads |
| GET | `/api/threads/:threadId` | Get thread by ID |
| POST | `/api/threads` | Create thread |
| GET | `/api/posts/thread/:threadId` | List posts in a thread |
| POST | `/api/posts/thread/:threadId` | Create post in a thread |
| GET | `/api/dashboard/summary` | Identity dashboard summary |

Note:

- For unsafe methods (`POST`, `PUT`, `PATCH`, `DELETE`), send `X-CSRF-Token`.
- Frontend handles CSRF and cookies automatically.

## Deployment Notes

- Frontend is designed to be hostable on GitHub Pages.
- Backend is designed for a separate host (for example Render).
- Configure the backend origin in `docs/runtime-config.js`.
- For production cross-origin cookies, use HTTPS and review:
  - `CSRF_COOKIE_SAME_SITE`
  - `CSRF_COOKIE_PARTITIONED`
  - `AUTH_COOKIE_SAME_SITE`
  - `ANON_COOKIE_SAME_SITE`
  - `*_COOKIE_SECURE`

## Security Docs

- `backend/SECURITY.md`
- `backend/SECURITY_IMPLEMENTATION.md`

## Troubleshooting

- `Missing required environment variables`: confirm `backend/.env` exists and includes `DATABASE_URL` and `JWT_SECRET`.
- Database connection errors in local dev: set `DB_SSL=false` unless your local PostgreSQL is SSL-enabled.
- CORS 403 (`Origin is not allowed`): make sure frontend origin is listed in `CORS_ORIGIN`.
- CSRF errors on POST routes: call `/api/csrf-token` first and include the token in `X-CSRF-Token`.
- Cross-site signup/login issues on strict browsers: use `SameSite=None; Secure` and set `CSRF_COOKIE_PARTITIONED=true`.
