# Ai-Image-Generation

## Administrator access

Pro grant endpoints are reserved for trusted administrators. There is no
public admin signup or role-elevation endpoint. To grant admin access, first
create and verify a regular account, then have a trusted database operator
promote that account:

```sql
UPDATE "User"
SET "role" = 'ADMIN'
WHERE "email" = lower('admin@example.com')
  AND "isActive" = true
  AND "emailVerifiedAt" IS NOT NULL;
```

The admin signs in through the regular `POST /api/v1/auth/login` endpoint.
Admin-only Pro grant endpoints are under `/api/v1/admin` and require an active
`ADMIN` account. Admin panel UI and dedicated admin account-management flows
are not implemented yet.

## Image upload limits

Image uploads have a per-file limit of 10 MB, a maximum dimension of 4096
pixels, and a 16-megapixel pixel budget. Monthly plan allowances are:

- Free: 10 uploads per UTC month and 100 MB of active image storage.
- Pro: 50 uploads per UTC month and 500 MB of active image storage.
- Max: uploads are unavailable while the plan is Coming Soon.

Deleting an image frees its storage space, but does not restore that month's
upload count. `GET /api/v1/images` returns current upload and storage usage.
Existing assets predate byte-size tracking, so the quota migration conservatively
accounts for each existing asset as 10 MB.
