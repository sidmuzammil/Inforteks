import "dotenv/config";
import { afterAll, beforeAll, expect, it } from "vitest";
import { randomUUID } from "node:crypto";
import { rm } from "node:fs/promises";
import sharp from "sharp";
import { db } from "../src/lib/db";
import { storeImage, readImage } from "../src/domains/storage";
import { saveResource } from "../src/domains/administration";
import { roles, type Actor } from "../src/domains/identity";

const id = `banner-test-${randomUUID()}`;
const actor: Actor = {
  id,
  scopes: roles.CONTENT,
  human: true,
  source: "admin",
  role: "CONTENT",
};
const directory = `.data/${id}`;
let sectionId: string | undefined;
let mediaId: string | undefined;
const original = {
  driver: process.env.STORAGE_DRIVER,
  directory: process.env.UPLOAD_DIR,
};
beforeAll(() => {
  if (new URL(process.env.DATABASE_URL ?? "").pathname !== "/inforteks_test")
    throw new Error("Banner tests require inforteks_test.");
  process.env.STORAGE_DRIVER = "local";
  process.env.UPLOAD_DIR = directory;
});
afterAll(async () => {
  if (sectionId) await db.homeSection.delete({ where: { id: sectionId } });
  if (mediaId) await db.media.delete({ where: { id: mediaId } });
  await db.auditEvent.deleteMany({ where: { actorId: id } });
  await rm(directory, { recursive: true, force: true });
  if (original.driver === undefined) delete process.env.STORAGE_DRIVER;
  else process.env.STORAGE_DRIVER = original.driver;
  if (original.directory === undefined) delete process.env.UPLOAD_DIR;
  else process.env.UPLOAD_DIR = original.directory;
  await db.$disconnect();
});
it("keeps uploaded banners private until an authorized editor publishes an active hero", async () => {
  const bytes = await sharp({
    create: { width: 300, height: 120, channels: 3, background: "#1651ed" },
  })
    .png()
    .toBuffer();
  const file = new File([new Uint8Array(bytes)], "banner.png", {
    type: "image/png",
  });
  await expect(
    storeImage({ ...actor, scopes: [] }, file, "", "Test banner", true),
  ).rejects.toThrow();
  const media = await storeImage(actor, file, "", "Test banner", true);
  mediaId = media.id;
  await expect(readImage(media.id)).rejects.toThrow();
  expect((await readImage(media.id, actor)).public).toBe(false);
  await expect(
    readImage(media.id, { ...actor, scopes: roles.CATALOG }),
  ).rejects.toThrow();
  const data = {
    title: "Test banner",
    subtitle: "Integration verification",
    kind: "hero",
    href: "/categories",
    buttonLabel: "Explore products",
    position: 99,
    visible: false,
    bannerMediaId: media.id,
  };
  await expect(
    saveResource(actor, "home-sections", {
      ...data,
      href: "//external.example",
    }),
  ).rejects.toThrow();
  const section = (await saveResource(actor, "home-sections", data)) as {
    id: string;
  };
  sectionId = section.id;
  await expect(readImage(media.id)).rejects.toThrow();
  await saveResource(
    actor,
    "home-sections",
    { ...data, visible: true },
    section.id,
  );
  expect((await readImage(media.id)).public).toBe(true);
  await saveResource(
    actor,
    "home-sections",
    { ...data, visible: true, startsAt: new Date(Date.now() + 3600000) },
    section.id,
  );
  await expect(readImage(media.id)).rejects.toThrow();
});
