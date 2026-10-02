import "dotenv/config";
import { mkdir, writeFile } from "node:fs/promises";
import { db } from "../src/lib/db";
import { actorForUser, requireScope } from "../src/domains/identity";
import { executeImport } from "../src/domains/administration";
import { executeAiRun } from "../src/domains/ai";
import { expireReservations } from "../src/domains/maintenance";
import { json } from "../src/lib/utils";
import type { Prisma } from "../src/generated/prisma/client";
import { z } from "zod";
import { runWorker } from "../src/lib/worker-runtime";
import { validateRuntime } from "../src/lib/runtime";
export async function runOneJob() {
  const job = await db.$transaction(async (tx) => {
    const rows = await tx.$queryRaw<
      { id: string }[]
    >`SELECT id FROM "Job" WHERE status='QUEUED' AND "availableAt"<=now() ORDER BY "createdAt" FOR UPDATE SKIP LOCKED LIMIT 1`;
    if (!rows.length) return null;
    return tx.job.update({
      where: { id: rows[0].id },
      data: {
        status: "RUNNING",
        lockedAt: new Date(),
        attempts: { increment: 1 },
      },
    });
  });
  if (!job) return false;
  try {
    const payload = job.payload as Record<string, string>;
    if (job.type === "IMPORT") {
      const actor = await actorForUser(job.actorId);
      requireScope(actor, "catalog:write");
      requireScope(actor, "pricing:write");
      await db.$transaction(
        async (tx) => {
          const result = await executeImport(tx, actor, payload.batchId);
          await tx.job.update({
            where: { id: job.id },
            data: { status: "COMPLETED", result },
          });
        },
        { timeout: 60000 },
      );
    } else if (job.type === "AI") {
      const result = await executeAiRun(payload.runId);
      await db.job.update({
        where: { id: job.id },
        data: {
          status: result.cancelled ? "CANCELLED" : "COMPLETED",
          result: json<Prisma.InputJsonValue>(result),
        },
      });
    } else if (job.type === "EMAIL") {
      if (
        process.env.NODE_ENV !== "production" &&
        process.env.EMAIL_PROVIDER !== "resend"
      ) {
        await mkdir(".data/mailbox", { recursive: true, mode: 0o700 });
        await writeFile(
          `.data/mailbox/${job.id}.json`,
          JSON.stringify(
            {
              to: payload.to,
              subject: "Reset your Inforteks password",
              url: payload.url,
            },
            null,
            2,
          ),
          { mode: 0o600 },
        );
        await db.job.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            result: { delivery: "development mailbox; not emailed" },
          },
        });
      } else if (process.env.RESEND_API_KEY && process.env.EMAIL_FROM) {
        const response = await fetch("https://api.resend.com/emails", {
          method: "POST",
          headers: {
            Authorization: `Bearer ${process.env.RESEND_API_KEY}`,
            "Content-Type": "application/json",
            "Idempotency-Key": job.dedupeKey,
          },
          body: JSON.stringify({
            from: process.env.EMAIL_FROM,
            to: payload.to,
            subject: "Reset your Inforteks password",
            text: `Use this secure link to reset your password: ${payload.url}`,
          }),
          signal: AbortSignal.timeout(15000),
        });
        if (!response.ok)
          throw new Error("Email provider rejected the request.");
        const result = await response.json();
        await db.job.update({
          where: { id: job.id },
          data: {
            status: "COMPLETED",
            result: { providerId: result.id, delivery: "accepted by provider" },
          },
        });
      } else
        await db.job.update({
          where: { id: job.id },
          data: {
            status: "BLOCKED",
            lastError: "Production email provider not connected.",
          },
        });
    } else
      await db.job.update({
        where: { id: job.id },
        data: {
          status: "BLOCKED",
          lastError:
            "Order notification delivery is not configured. Order remains available in the account.",
        },
      });
  } catch (error) {
    const message =
      job.type === "AI"
        ? "AI provider or tool execution failed. Check configuration and recorded outcomes."
        : error instanceof Error
          ? error.message
          : "Job failed";
    const retry =
      job.type === "EMAIL" &&
      job.attempts < Number(process.env.WORKER_MAX_ATTEMPTS ?? 3);
    await db.job.update({
      where: { id: job.id },
      data: {
        status: retry ? "QUEUED" : "FAILED",
        availableAt: new Date(Date.now() + 2 ** job.attempts * 10000),
        lastError: message.slice(0, 400),
      },
    });
    if (job.type === "AI")
      await db.aiRun.updateMany({
        where: {
          id: (job.payload as { runId: string }).runId,
          status: { not: "CANCELLED" },
        },
        data: {
          status: "FAILED",
          result:
            "Task stopped. Review existing drafts and proposals before retrying.",
        },
      });
  }
  return true;
}
async function main() {
  validateRuntime();
  const port = z.coerce
    .number()
    .int()
    .min(1)
    .max(65535)
    .parse(process.env.PORT ?? process.env.WORKER_HEALTH_PORT ?? 8081);
  const pollMs = z.coerce
    .number()
    .int()
    .min(100)
    .max(60000)
    .parse(process.env.WORKER_POLL_MS ?? 3000);
  const shutdown = new AbortController();
  const stop = () => shutdown.abort();
  process.once("SIGTERM", stop);
  process.once("SIGINT", stop);
  try {
    await runWorker({
      port,
      pollMs,
      signal: shutdown.signal,
      maintain: expireReservations,
      runOne: runOneJob,
      disconnect: () => db.$disconnect(),
      onListening: () => console.log("Inforteks worker health server started."),
    });
  } finally {
    process.off("SIGTERM", stop);
    process.off("SIGINT", stop);
  }
}
if (process.argv[1]?.endsWith("worker.ts")) {
  void main().catch(() => {
    console.error(
      "Worker stopped after a configuration, database or runtime failure. Inspect service health and job outcomes before retrying.",
    );
    process.exitCode = 1;
  });
}
