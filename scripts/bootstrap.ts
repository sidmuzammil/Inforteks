import "dotenv/config";
import { createInterface } from "node:readline/promises";
import { stdin, stdout } from "node:process";
import { auth } from "../src/lib/auth";
import { db } from "../src/lib/db";
async function main() {
  if (await db.user.count({ where: { role: "OWNER" } }))
    throw new Error(
      "An Owner already exists. Use the Owner-controlled staff workflow.",
    );
  const rl = createInterface({ input: stdin, output: stdout });
  const email =
    process.env.BOOTSTRAP_EMAIL ?? (await rl.question("Owner email: "));
  const name =
    process.env.BOOTSTRAP_NAME ?? (await rl.question("Owner name: "));
  // Supply the password through a secure environment binding; never echo it to the terminal.
  const password = process.env.BOOTSTRAP_PASSWORD;
  rl.close();
  if (!password || password.length < 12)
    throw new Error(
      "Supply BOOTSTRAP_PASSWORD securely (at least 12 characters). See README for hidden-input shell command.",
    );
  const result = await auth.api.signUpEmail({
    body: { email, name, password },
  });
  await db.$transaction(async (tx) => {
    await tx.$executeRaw`SELECT pg_advisory_xact_lock(49273401)`;
    if (await tx.user.count({ where: { role: "OWNER" } }))
      throw new Error("Another Owner was created concurrently.");
    await tx.user.update({
      where: { id: result.user.id },
      data: { role: "OWNER", emailVerified: true },
    });
    await tx.auditEvent.create({
      data: {
        actorId: result.user.id,
        source: "admin",
        operation: "owner.bootstrap",
        targetId: result.user.id,
      },
    });
  });
  console.log("Owner created. Sign in at /login, then open /admin.");
}
main().finally(() => db.$disconnect());
