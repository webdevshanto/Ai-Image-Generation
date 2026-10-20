ALTER TYPE "GenerationMode" ADD VALUE 'TEXT_TO_VIDEO';
ALTER TYPE "GenerationMode" ADD VALUE 'IMAGE_TO_VIDEO';
ALTER TYPE "GenerationMode" ADD VALUE 'VIDEO_TO_VIDEO';

ALTER TABLE "Plan"
ADD COLUMN "textToVideoCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "imageToVideoCredits" INTEGER NOT NULL DEFAULT 0,
ADD COLUMN "videoToVideoCredits" INTEGER NOT NULL DEFAULT 0;

UPDATE "Plan"
SET
  "monthlyCredits" = CASE
    WHEN "slug" = 'free' THEN 16
    WHEN "slug" = 'pro' THEN 58
    ELSE "monthlyCredits"
  END,
  "textToVideoCredits" = CASE
    WHEN "slug" = 'free' THEN 2
    WHEN "slug" = 'pro' THEN 6
    ELSE 0
  END,
  "imageToVideoCredits" = CASE
    WHEN "slug" = 'free' THEN 2
    WHEN "slug" = 'pro' THEN 6
    ELSE 0
  END,
  "videoToVideoCredits" = CASE
    WHEN "slug" = 'free' THEN 2
    WHEN "slug" = 'pro' THEN 6
    ELSE 0
  END;
