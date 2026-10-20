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

The image library also limits the number of images a user can keep at once:
Free users can keep 10 images and Pro users can keep 30. Deleting an image
frees a library slot. Existing libraries over the new limit remain accessible,
but further uploads are blocked until the count is below the plan limit.

## Monthly generation credits

Free includes 5 credits per image mode and 2 per video mode (16 total):
Text-to-Image, Image-to-Image, Text-to-Video, Image-to-Video, and Video-to-Video.
Pro includes 20 credits per image mode and 6 per video mode (58 total).
Credits reset monthly on the first day in UTC. Video quotas are configured in
the plans and credit summary; video generations also use these per-mode limits.

## Image generation API

The authenticated `POST /api/v1/generations` endpoint supports
`text-to-image`, `image-to-image`, `text-to-video`, `image-to-video`, and
`video-to-video`. Image-guided modes require an owned `sourceImageId`;
video-to-video requires an owned `sourceVideoId`. The endpoint returns `202`
and a generation ID. Poll `GET /api/v1/generations/:id` for status and the
result URL. Generation reserves one monthly credit; failed jobs are refunded.
Generated media is saved to Cloudinary and the user's matching library.

Configure `GEMINI_API_KEY`, `GEMINI_IMAGE_MODEL` (defaults to
`gemini-nano-banana-2.1`), `GEMINI_VIDEO_MODEL` (defaults to
`gemini-omni-1.1-flash`), `CLOUDINARY_*`, and `REDIS_URL`. The same Gemini key
must have access to the configured image and video models.

Video modes are `text-to-video`, `image-to-video`, and `video-to-video`.
Upload MP4 source videos through `/api/v1/videos` (25 MB maximum) and use the
returned ID for video-to-video. Free users can keep 5 videos and Pro users 15.
Generated video results are also saved in that library. Gemini processing is
asynchronous through the worker and the result appears in the generation status
response.
