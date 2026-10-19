ALTER TABLE "EmailVerificationChallenge"
  ADD COLUMN "firstName" TEXT,
  ADD COLUMN "lastName" TEXT,
  ADD COLUMN "passwordHash" TEXT,
  DROP COLUMN "verifiedAt";