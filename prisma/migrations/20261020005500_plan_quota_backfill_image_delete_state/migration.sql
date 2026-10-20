ALTER TABLE "ImageAsset"
ADD COLUMN "deletionPending" BOOLEAN NOT NULL DEFAULT false;

UPDATE "Plan"
SET
    "monthlyCredits" = 15,
    "textToImageCredits" = 5,
    "imageToImageCredits" = 5,
    "enhanceImageCredits" = 5,
    "isActive" = true,
    "isComingSoon" = false
WHERE "slug" = 'free';

UPDATE "Plan"
SET
    "monthlyCredits" = 60,
    "textToImageCredits" = 20,
    "imageToImageCredits" = 20,
    "enhanceImageCredits" = 20,
    "isActive" = true,
    "isComingSoon" = false
WHERE "slug" = 'pro';

UPDATE "Plan"
SET
    "monthlyCredits" = 0,
    "textToImageCredits" = 0,
    "imageToImageCredits" = 0,
    "enhanceImageCredits" = 0,
    "isActive" = false,
    "isComingSoon" = true
WHERE "slug" = 'max';
