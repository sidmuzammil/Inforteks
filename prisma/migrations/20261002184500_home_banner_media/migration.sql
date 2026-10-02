ALTER TABLE "HomeSection" ADD COLUMN "buttonLabel" TEXT NOT NULL DEFAULT 'Explore collection';
ALTER TABLE "HomeSection" ADD COLUMN "bannerMediaId" TEXT;
CREATE INDEX "HomeSection_bannerMediaId_idx" ON "HomeSection"("bannerMediaId");
ALTER TABLE "HomeSection" ADD CONSTRAINT "HomeSection_bannerMediaId_fkey" FOREIGN KEY ("bannerMediaId") REFERENCES "Media"("id") ON DELETE SET NULL ON UPDATE CASCADE;
