import { db } from "@/lib/db";
import { validateRuntime } from "@/lib/runtime";
export async function GET() {
  try {
    validateRuntime();
    await db.$queryRaw`SELECT 1`;
    return Response.json({ status: "ready" });
  } catch {
    return Response.json({ status: "unavailable" }, { status: 503 });
  }
}
