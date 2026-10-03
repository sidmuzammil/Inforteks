ALTER TABLE "Address"
  ADD COLUMN "area" TEXT,
  ADD COLUMN "zone" TEXT,
  ADD COLUMN "postalCode" TEXT,
  ADD COLUMN "location" JSONB;
