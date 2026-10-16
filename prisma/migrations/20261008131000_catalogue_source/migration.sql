-- Private, durable source identities make reviewed catalogue imports repeatable.
-- No products, stock or merchant records are inserted by this migration.
CREATE TABLE "CatalogueSource" (
  "id" TEXT NOT NULL,
  "source" TEXT NOT NULL,
  "externalId" TEXT NOT NULL,
  "productId" TEXT NOT NULL,
  "manifestHash" TEXT NOT NULL,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP,
  CONSTRAINT "CatalogueSource_pkey" PRIMARY KEY ("id")
);

CREATE UNIQUE INDEX "CatalogueSource_source_externalId_key" ON "CatalogueSource"("source", "externalId");
CREATE INDEX "CatalogueSource_productId_idx" ON "CatalogueSource"("productId");
ALTER TABLE "CatalogueSource" ADD CONSTRAINT "CatalogueSource_productId_fkey" FOREIGN KEY ("productId") REFERENCES "Product"("id") ON DELETE RESTRICT ON UPDATE CASCADE;
