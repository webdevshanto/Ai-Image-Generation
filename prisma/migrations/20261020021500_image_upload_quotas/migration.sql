ALTER TABLE "Plan"
ADD COLUMN "monthlyImageUploads" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "imageStorageLimitBytes" INTEGER NOT NULL DEFAULT 0;

ALTER TABLE "ImageAsset"
ADD COLUMN "fileSizeBytes" INTEGER NOT NULL DEFAULT 0;

CREATE TABLE "ImageUploadUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "uploads" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageUploadUsage_pkey" PRIMARY KEY ("id")
);

CREATE TABLE "ImageUploadReservation" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "fileSizeBytes" INTEGER NOT NULL,
    "publicId" TEXT NOT NULL,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "expiresAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "ImageUploadReservation_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "ImageUploadUsage_userId_periodStart_key"
ON "ImageUploadUsage"("userId", "periodStart");

CREATE INDEX "ImageUploadReservation_userId_expiresAt_idx"
ON "ImageUploadReservation"("userId", "expiresAt");

ALTER TABLE "ImageUploadUsage"
ADD CONSTRAINT "ImageUploadUsage_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "ImageUploadReservation"
ADD CONSTRAINT "ImageUploadReservation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

-- Existing uploads have no stored byte size; charge the maximum accepted file
-- size conservatively so pre-quota assets cannot bypass the storage allowance.
UPDATE "ImageAsset"
SET "fileSizeBytes" = 10485760;

INSERT INTO "ImageUploadUsage" ("id", "userId", "periodStart", "uploads", "updatedAt")
SELECT
    'legacy-image-usage-' || md5("userId" || date_trunc('month', "createdAt")::text),
    "userId",
    date_trunc('month', "createdAt"),
    COUNT(*)::INTEGER,
    CURRENT_TIMESTAMP
FROM "ImageAsset"
GROUP BY "userId", date_trunc('month', "createdAt");

UPDATE "Plan"
SET "monthlyImageUploads" = 10,
    "imageStorageLimitBytes" = 104857600
WHERE "slug" = 'free';

UPDATE "Plan"
SET "monthlyImageUploads" = 50,
    "imageStorageLimitBytes" = 524288000
WHERE "slug" = 'pro';

UPDATE "Plan"
SET "monthlyImageUploads" = 0,
    "imageStorageLimitBytes" = 0
WHERE "slug" = 'max';
