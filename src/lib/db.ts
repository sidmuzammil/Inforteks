import "dotenv/config";
import { PrismaClient } from "@/generated/prisma/client";
import { PrismaPg } from "@prisma/adapter-pg";
import { databasePoolConfig } from "./database-config";
const globalDb = globalThis as unknown as { prisma?: PrismaClient };
export const db =
  globalDb.prisma ??
  new PrismaClient({
    adapter: new PrismaPg(databasePoolConfig()),
  });
if (process.env.NODE_ENV !== "production") globalDb.prisma = db;
export type Tx = Parameters<Parameters<typeof db.$transaction>[0]>[0];
