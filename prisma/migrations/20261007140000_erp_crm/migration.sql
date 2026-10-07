CREATE TYPE "CrmStage" AS ENUM ('NEW', 'QUALIFIED', 'PROPOSAL', 'WON', 'LOST');
CREATE TABLE "CrmOpportunity" (
  "id" TEXT NOT NULL PRIMARY KEY, "title" TEXT NOT NULL,
  "stage" "CrmStage" NOT NULL DEFAULT 'NEW', "channel" "SalesChannel" NOT NULL,
  "businessCustomerId" TEXT REFERENCES "BusinessCustomer"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "userId" TEXT REFERENCES "User"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "guestOrderId" TEXT REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "orderId" TEXT UNIQUE REFERENCES "Order"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "expectedValue" INTEGER NOT NULL DEFAULT 0 CHECK ("expectedValue" >= 0),
  "expectedClose" TIMESTAMP(3), "assignedTo" TEXT, "notes" TEXT NOT NULL DEFAULT '',
  "lostReason" TEXT NOT NULL DEFAULT '', "createdBy" TEXT NOT NULL, "version" INTEGER NOT NULL DEFAULT 1,
  "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP, "updatedAt" TIMESTAMP(3) NOT NULL,
  CONSTRAINT "CrmOpportunity_contact_check" CHECK (
    ("channel" = 'DIRECT' AND "businessCustomerId" IS NOT NULL AND "userId" IS NULL AND "guestOrderId" IS NULL)
    OR ("channel" = 'ONLINE' AND "businessCustomerId" IS NULL AND (("userId" IS NOT NULL AND "guestOrderId" IS NULL) OR ("userId" IS NULL AND "guestOrderId" IS NOT NULL)))
  ),
  CONSTRAINT "CrmOpportunity_won_order_check" CHECK ("stage" <> 'WON' OR "orderId" IS NOT NULL),
  CONSTRAINT "CrmOpportunity_lost_reason_check" CHECK ("stage" <> 'LOST' OR length(trim("lostReason")) > 0)
);
CREATE INDEX "CrmOpportunity_channel_stage_updatedAt_idx" ON "CrmOpportunity"("channel", "stage", "updatedAt");
CREATE INDEX "CrmOpportunity_businessCustomerId_idx" ON "CrmOpportunity"("businessCustomerId");
CREATE INDEX "CrmOpportunity_userId_idx" ON "CrmOpportunity"("userId");
CREATE INDEX "CrmOpportunity_guestOrderId_idx" ON "CrmOpportunity"("guestOrderId");
CREATE INDEX "CrmOpportunity_assignedTo_stage_idx" ON "CrmOpportunity"("assignedTo", "stage");
CREATE TABLE "CrmActivity" (
  "id" TEXT NOT NULL PRIMARY KEY,
  "opportunityId" TEXT NOT NULL REFERENCES "CrmOpportunity"("id") ON DELETE RESTRICT ON UPDATE CASCADE,
  "kind" TEXT NOT NULL, "title" TEXT NOT NULL, "notes" TEXT NOT NULL DEFAULT '',
  "dueAt" TIMESTAMP(3) NOT NULL, "completedAt" TIMESTAMP(3), "completedBy" TEXT,
  "createdBy" TEXT NOT NULL, "createdAt" TIMESTAMP(3) NOT NULL DEFAULT CURRENT_TIMESTAMP
);
CREATE INDEX "CrmActivity_opportunityId_createdAt_idx" ON "CrmActivity"("opportunityId", "createdAt");
CREATE INDEX "CrmActivity_completedAt_dueAt_idx" ON "CrmActivity"("completedAt", "dueAt");
