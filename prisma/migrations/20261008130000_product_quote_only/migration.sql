-- Preserve every existing product's online purchase behavior.
-- Quote-only publication never creates a selling price or changes inventory.
ALTER TABLE "Product" ADD COLUMN "quoteOnly" BOOLEAN NOT NULL DEFAULT false;
