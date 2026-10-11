-- Bind future integration proposals to the credential that submitted them.
-- Existing rows retain NULL: staff proposals remain valid, while legacy API
-- proposals require resubmission because their original key cannot be proven.
ALTER TABLE "Proposal" ADD COLUMN "originatingKeyId" TEXT;

CREATE INDEX "Proposal_originatingKeyId_idx" ON "Proposal"("originatingKeyId");
ALTER TABLE "Proposal" ADD CONSTRAINT "Proposal_originatingKeyId_fkey"
  FOREIGN KEY ("originatingKeyId") REFERENCES "ApiKey"("id")
  ON DELETE RESTRICT ON UPDATE CASCADE;
