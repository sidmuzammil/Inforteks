import { createServer, type Server } from "node:http";
import { setTimeout as pause } from "node:timers/promises";

type WorkerOptions = {
  port: number;
  pollMs: number;
  signal: AbortSignal;
  maintain: () => Promise<unknown>;
  runOne: () => Promise<boolean>;
  disconnect: () => Promise<unknown>;
  onListening?: (server: Server) => void;
};

export async function runWorker(options: WorkerOptions) {
  let lastProgress = 0;
  let lastMaintenance = 0;
  const server = createServer((request, response) => {
    if (request.url !== "/health") {
      response.writeHead(404).end();
      return;
    }
    // Includes successful database work; opening the HTTP port alone isn't readiness.
    const ready =
      !options.signal.aborted &&
      lastProgress > 0 &&
      Date.now() - lastProgress < 5 * 60_000;
    response.writeHead(ready ? 200 : 503, {
      "Content-Type": "application/json",
      "Cache-Control": "no-store",
    });
    response.end(JSON.stringify({ status: ready ? "ready" : "unavailable" }));
  });
  try {
    await new Promise<void>((resolve, reject) => {
      server.once("error", reject);
      server.listen(options.port, "0.0.0.0", resolve);
    });
    options.onListening?.(server);
    while (!options.signal.aborted) {
      if (Date.now() - lastMaintenance >= 60_000) {
        await options.maintain();
        lastMaintenance = Date.now();
      }
      if (options.signal.aborted) break;
      const worked = await options.runOne();
      lastProgress = Date.now();
      if (!worked && !options.signal.aborted) {
        try {
          await pause(options.pollMs, undefined, { signal: options.signal });
        } catch (error) {
          if (!options.signal.aborted) throw error;
        }
      }
    }
  } finally {
    lastProgress = 0;
    await new Promise<void>((resolve) => {
      server.close(() => resolve());
      server.closeIdleConnections();
    });
    await options.disconnect();
  }
}
