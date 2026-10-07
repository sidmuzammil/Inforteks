CREATE TYPE "SalesChannel" AS ENUM ('ONLINE', 'DIRECT');
CREATE TABLE "BusinessCustomer" (
 "id" TEXT NOT NULL PRIMARY KEY, "company" TEXT NOT NULL, "email" TEXT NOT NULL DEFAULT '',
 "address" JSONB NOT NULL, "notes" TEXT NOT NULL DEFAULT '', "active" BOOLEAN NOT NULL DEFAULT true,
 "version" INTEGER NOT NULL DEFAULT 1, "createdBy" TEXT NOT NULL,
 "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL
);
CREATE TABLE "SalesVisit" (
 "id" TEXT NOT NULL PRIMARY KEY, "customerId" TEXT NOT NULL REFERENCES "BusinessCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 "actorId" TEXT NOT NULL, "outcome" TEXT NOT NULL, "notes" TEXT NOT NULL,
 "followUpAt" TIMESTAMP(3), "completedAt" TIMESTAMP(3), "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
ALTER TABLE "Order" ADD COLUMN "channel" "SalesChannel" NOT NULL DEFAULT 'ONLINE',
 ADD COLUMN "businessCustomerId" TEXT REFERENCES "BusinessCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
 ADD COLUMN "businessSnapshot" JSONB, ADD COLUMN "salesActorId" TEXT, ADD COLUMN "salesNote" TEXT;
CREATE INDEX "BusinessCustomer_active_company_idx" ON "BusinessCustomer"("active", "company");
CREATE INDEX "SalesVisit_customerId_createdAt_idx" ON "SalesVisit"("customerId", "createdAt");
CREATE INDEX "SalesVisit_completedAt_followUpAt_idx" ON "SalesVisit"("completedAt", "followUpAt");
CREATE INDEX "Order_channel_createdAt_idx" ON "Order"("channel", "createdAt");
CREATE INDEX "Order_businessCustomerId_createdAt_idx" ON "Order"("businessCustomerId", "createdAt");
