ALTER TABLE "Plan"
ADD COLUMN "libraryImageLimit" INTEGER NOT NULL DEFAULT 0;

UPDATE "Plan"
SET "libraryImageLimit" = 10
WHERE "slug" = 'free';

UPDATE "Plan"
SET "libraryImageLimit" = 30
WHERE "slug" = 'pro';

UPDATE "Plan"
SET "libraryImageLimit" = 0
WHERE "slug" = 'max';
