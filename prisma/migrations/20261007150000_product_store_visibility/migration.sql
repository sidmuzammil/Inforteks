-- Keep existing products on their current sales channels.
ALTER TABLE "Product" ADD COLUMN "store" BOOLEAN NOT NULL DEFAULT true;
