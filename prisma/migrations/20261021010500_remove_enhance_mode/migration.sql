DO $$
BEGIN
    IF EXISTS (
        SELECT 1 FROM "GenerationJob" WHERE "mode"::text = 'ENHANCE_IMAGE'
    ) OR EXISTS (
        SELECT 1 FROM "CreditUsage" WHERE "mode"::text = 'ENHANCE_IMAGE'
    ) OR EXISTS (
        SELECT 1 FROM "CreditTransaction" WHERE "mode"::text = 'ENHANCE_IMAGE'
    ) THEN
        RAISE EXCEPTION 'Cannot remove ENHANCE_IMAGE while generation or credit records still use it';
    END IF;
END
$$;

UPDATE "Plan"
SET "monthlyCredits" = CASE
    WHEN "slug" = 'free' THEN 10
    WHEN "slug" = 'pro' THEN 40
    ELSE "monthlyCredits"
END;

ALTER TABLE "Plan" DROP COLUMN "enhanceImageCredits";

ALTER TABLE "GenerationJob"
ALTER COLUMN "mode" TYPE TEXT USING "mode"::text;

ALTER TABLE "CreditUsage"
ALTER COLUMN "mode" TYPE TEXT USING "mode"::text;

ALTER TABLE "CreditTransaction"
ALTER COLUMN "mode" TYPE TEXT USING "mode"::text;

DROP TYPE "GenerationMode";

CREATE TYPE "GenerationMode" AS ENUM ('TEXT_TO_IMAGE', 'IMAGE_TO_IMAGE');

ALTER TABLE "GenerationJob"
ALTER COLUMN "mode" TYPE "GenerationMode" USING "mode"::"GenerationMode";

ALTER TABLE "CreditUsage"
ALTER COLUMN "mode" TYPE "GenerationMode" USING "mode"::"GenerationMode";

ALTER TABLE "CreditTransaction"
ALTER COLUMN "mode" TYPE "GenerationMode" USING "mode"::"GenerationMode";
