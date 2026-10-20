CREATE TYPE "VideoAssetType" AS ENUM ('SOURCE', 'RESULT');

ALTER TABLE "Plan"
ADD COLUMN "libraryVideoLimit" INTEGER NOT NULL DEFAULT 0;

UPDATE "Plan"
SET "libraryVideoLimit" = CASE
  WHEN "slug" = 'free' THEN 5
  WHEN "slug" = 'pro' THEN 15
  ELSE 0
END;

CREATE TABLE "VideoAsset" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "generationId" TEXT,
  "type" "VideoAssetType" NOT NULL,
  "url" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "format" TEXT,
  "fileSizeBytes" INTEGER NOT NULL DEFAULT 0,
  "deletionPending" BOOLEAN NOT NULL DEFAULT false,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VideoAsset_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VideoAsset_userId_createdAt_idx" ON "VideoAsset"("userId", "createdAt");
CREATE INDEX "VideoAsset_generationId_idx" ON "VideoAsset"("generationId");

ALTER TABLE "VideoAsset"
ADD CONSTRAINT "VideoAsset_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "VideoAsset"
ADD CONSTRAINT "VideoAsset_generationId_fkey"
FOREIGN KEY ("generationId") REFERENCES "GenerationJob"("id") ON DELETE SET NULL ON UPDATE CASCADE;

CREATE TABLE "VideoUploadReservation" (
  "id" TEXT NOT NULL,
  "userId" TEXT NOT NULL,
  "publicId" TEXT NOT NULL,
  "fileSizeBytes" INTEGER NOT NULL,
  "expiresAt" TIMESTAMP(3) NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

  CONSTRAINT "VideoUploadReservation_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "VideoUploadReservation_userId_expiresAt_idx"
ON "VideoUploadReservation"("userId", "expiresAt");

ALTER TABLE "VideoUploadReservation"
ADD CONSTRAINT "VideoUploadReservation_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id") ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "GenerationJob"
ADD COLUMN "sourceVideoId" TEXT;

CREATE INDEX "GenerationJob_sourceVideoId_idx"
ON "GenerationJob"("sourceVideoId");

ALTER TABLE "GenerationJob"
ADD CONSTRAINT "GenerationJob_sourceVideoId_fkey"
FOREIGN KEY ("sourceVideoId") REFERENCES "VideoAsset"("id") ON DELETE SET NULL ON UPDATE CASCADE;
