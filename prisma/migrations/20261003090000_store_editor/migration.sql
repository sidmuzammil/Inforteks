ALTER TABLE "HomeSection" ADD COLUMN "content" JSONB NOT NULL DEFAULT '{}', ADD COLUMN "version" INTEGER NOT NULL DEFAULT 1;
CREATE TABLE "_HomeSectionAssets" ("A" TEXT NOT NULL, "B" TEXT NOT NULL, CONSTRAINT "_HomeSectionAssets_AB_pkey" PRIMARY KEY ("A", "B"));
CREATE INDEX "_HomeSectionAssets_B_index" ON "_HomeSectionAssets"("B");
ALTER TABLE "_HomeSectionAssets" ADD CONSTRAINT "_HomeSectionAssets_A_fkey" FOREIGN KEY ("A") REFERENCES "HomeSection"("id") ON DELETE CASCADE ON UPDATE CASCADE;
ALTER TABLE "_HomeSectionAssets" ADD CONSTRAINT "_HomeSectionAssets_B_fkey" FOREIGN KEY ("B") REFERENCES "Media"("id") ON DELETE CASCADE ON UPDATE CASCADE;
-- Existing featured sections displayed offers; preserve that selection on upgrade.
UPDATE "HomeSection" SET "kind" = 'offers' WHERE "kind" = 'featured';
-- Move the previously hardcoded CTA into merchant-editable content.
INSERT INTO "HomeSection" ("id", "title", "subtitle", "kind", "href", "buttonLabel", "position", "content")
SELECT 'homepage-workspace-cta', 'Better together. Brilliant in every detail.', 'Put together a workspace that works for you.', 'cta', '/categories', 'Find your setup', COALESCE(MAX("position"),0)+10,
'{"eyebrow":"BUILT AROUND YOUR AMBITION","footer":"CREATE.","imageAlt":"Illustrative workstation tower"}'::jsonb FROM "HomeSection"
HAVING NOT EXISTS (SELECT 1 FROM "HomeSection" WHERE "kind"='cta');
-- A first-use storefront gets editable brand copy, never invented products or prices.
INSERT INTO "HomeSection" ("id", "title", "subtitle", "kind", "href", "buttonLabel", "position")
SELECT 'homepage-main-hero', 'Technology. Thoughtfully selected.', 'Explore Inforteks for work, play and everyday possibilities.', 'hero', '/categories', 'Explore products', 0
WHERE NOT EXISTS (SELECT 1 FROM "HomeSection" WHERE "kind"='hero');
INSERT INTO "HomeSection" ("id", "title", "subtitle", "kind", "href", "buttonLabel", "position")
SELECT 'homepage-featured-products', 'Selected for you', 'FEATURED PRODUCTS', 'featured', '/search?featured=true', 'Explore products', 20
WHERE NOT EXISTS (SELECT 1 FROM "HomeSection" WHERE "kind"='featured');
INSERT INTO "HomeSection" ("id", "title", "subtitle", "kind", "href", "buttonLabel", "position")
SELECT 'homepage-sale-products', 'Current offers', 'SAVE ON YOUR NEXT UPGRADE', 'offers', '/offers', 'Shop offers', 30
WHERE NOT EXISTS (SELECT 1 FROM "HomeSection" WHERE "kind"='offers');
