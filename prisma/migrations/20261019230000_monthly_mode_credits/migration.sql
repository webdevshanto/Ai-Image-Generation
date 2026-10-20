-- Store per-mode monthly quotas and ledger metadata for reservations/refunds.
ALTER TABLE "CreditTransaction"
ADD COLUMN "mode" "GenerationMode",
ADD COLUMN "periodStart" TIMESTAMP(3);

ALTER TABLE "Plan"
ADD COLUMN "enhanceImageCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "imageToImageCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "isComingSoon" BOOLEAN NOT NULL DEFAULT false,
ADD COLUMN "textToImageCredits" INTEGER NOT NULL DEFAULT 0,
ALTER COLUMN "priceCents" DROP NOT NULL,
ALTER COLUMN "monthlyCredits" SET DEFAULT 0;

CREATE TABLE "CreditUsage" (
    "id" TEXT NOT NULL,
    "userId" TEXT NOT NULL,
    "mode" "GenerationMode" NOT NULL,
    "periodStart" TIMESTAMP(3) NOT NULL,
    "used" INTEGER NOT NULL DEFAULT 0,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
    "updatedAt" TIMESTAMP(3) NOT NULL,

    CONSTRAINT "CreditUsage_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "CreditUsage_periodStart_idx"
ON "CreditUsage"("periodStart");

CREATE UNIQUE INDEX "CreditUsage_userId_mode_periodStart_key"
ON "CreditUsage"("userId", "mode", "periodStart");

CREATE UNIQUE INDEX "CreditTransaction_generationId_type_key"
ON "CreditTransaction"("generationId", "type");

ALTER TABLE "CreditUsage"
ADD CONSTRAINT "CreditUsage_userId_fkey"
FOREIGN KEY ("userId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;
