ALTER TYPE "AuthTokenType" ADD VALUE 'REFRESH_TOKEN';

ALTER TABLE "AuthToken"
  ADD COLUMN "familyId" TEXT,
  ADD COLUMN "revokedAt" TIMESTAMP(3);

CREATE INDEX "AuthToken_familyId_type_revokedAt_idx"
  ON "AuthToken"("familyId", "type", "revokedAt");