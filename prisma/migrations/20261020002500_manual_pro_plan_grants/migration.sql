CREATE TABLE "PlanGrant" (
    "id" TEXT NOT NULL,
    "recipientUserId" TEXT NOT NULL,
    "grantedByUserId" TEXT,
    "planId" TEXT NOT NULL,
    "subscriptionId" TEXT,
    "durationDays" INTEGER NOT NULL,
    "note" TEXT,
    "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,

    CONSTRAINT "PlanGrant_pkey" PRIMARY KEY ("id")
);

CREATE INDEX "PlanGrant_recipientUserId_createdAt_idx"
ON "PlanGrant"("recipientUserId", "createdAt");

CREATE INDEX "PlanGrant_grantedByUserId_createdAt_idx"
ON "PlanGrant"("grantedByUserId", "createdAt");

ALTER TABLE "PlanGrant"
ADD CONSTRAINT "PlanGrant_recipientUserId_fkey"
FOREIGN KEY ("recipientUserId") REFERENCES "User"("id")
ON DELETE CASCADE ON UPDATE CASCADE;

ALTER TABLE "PlanGrant"
ADD CONSTRAINT "PlanGrant_grantedByUserId_fkey"
FOREIGN KEY ("grantedByUserId") REFERENCES "User"("id")
ON DELETE SET NULL ON UPDATE CASCADE;

ALTER TABLE "PlanGrant"
ADD CONSTRAINT "PlanGrant_planId_fkey"
FOREIGN KEY ("planId") REFERENCES "Plan"("id")
ON DELETE RESTRICT ON UPDATE CASCADE;

ALTER TABLE "PlanGrant"
ADD CONSTRAINT "PlanGrant_subscriptionId_fkey"
FOREIGN KEY ("subscriptionId") REFERENCES "Subscription"("id")
ON DELETE SET NULL ON UPDATE CASCADE;
