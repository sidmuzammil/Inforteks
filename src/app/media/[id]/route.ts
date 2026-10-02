import { readImage } from "@/domains/storage";
import { requestActor } from "@/lib/session";
export async function GET(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
) {
  try {
    const actor = await requestActor(request).catch(() => undefined);
    const {
      body,
      mime,
      public: pub,
    } = await readImage((await params).id, actor);
    return new Response(new Uint8Array(body), {
      headers: {
        "Content-Type": mime,
        "Cache-Control": pub ? "public, max-age=300" : "private, no-store",
        "X-Content-Type-Options": "nosniff",
      },
    });
  } catch {
    return new Response("Not found", { status: 404 });
  }
}
