ALTER TYPE "enum_element-product-design_validation"
  ADD VALUE IF NOT EXISTS 'Need to be Validated';

ALTER TABLE "element-product-design"
  ADD COLUMN IF NOT EXISTS validation_approval_token VARCHAR(255),
  ADD COLUMN IF NOT EXISTS validation_approval_token_expires_at TIMESTAMP WITH TIME ZONE,
  ADD COLUMN IF NOT EXISTS validation_approval_token_used_at TIMESTAMP WITH TIME ZONE;

CREATE UNIQUE INDEX IF NOT EXISTS idx_epd_validation_approval_token
  ON "element-product-design" (validation_approval_token)
  WHERE validation_approval_token IS NOT NULL;
