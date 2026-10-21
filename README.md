# AI Image Generation Backend

Authentication-first API backend built with Express, Prisma, and PostgreSQL.

## Setup

1. Copy `.env.example` to `.env` and configure the database, Redis, JWT, and
   SMTP settings.
2. Install dependencies with `pnpm install`.
3. Apply database migrations with `pnpm db:deploy`.
4. Start the development server with `pnpm dev`.

## API

Authentication endpoints are mounted under `/api/v1/auth`:

- `POST /register` — begin registration and send an email verification code.
- `POST /verify-email` — verify the code and create the account.
- `POST /login`, `POST /refresh`, and `POST /logout` — manage sessions.
- `POST /password/forgot` and `POST /password/reset` — reset a password.
- `GET /me`, `PATCH /me`, `PATCH /password`, and `DELETE /me` — manage the
  authenticated account.

Health and readiness endpoints are available at `/health` and
`/api/health/ready`.

## Database scope

The database stores user accounts, authentication tokens, and pending email
verification challenges. A forward-only migration removes the former plans,
credits, media, and generation data while preserving accounts and authentication
records.
