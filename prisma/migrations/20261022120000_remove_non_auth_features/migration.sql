DROP TABLE IF EXISTS
  "Feedback",
  "CreditUsage",
  "CreditTransaction",
  "Payment",
  "PlanGrant",
  "Subscription",
  "Plan",
  "ImageUploadReservation",
  "ImageUploadUsage",
  "VideoUploadReservation",
  "VideoAsset",
  "ImageAsset",
  "GenerationJob"
CASCADE;

ALTER TABLE "User" DROP COLUMN IF EXISTS "role";

DROP TYPE IF EXISTS
  "FeedbackCategory",
  "FeedbackStatus",
  "CreditTransactionType",
  "SubscriptionStatus",
  "PaymentStatus",
  "VideoAssetType",
  "AssetType",
  "GenerationStatus",
  "GenerationMode",
  "UserRole";
