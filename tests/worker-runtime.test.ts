import { describe, expect, it, vi } from "vitest";
import type { AddressInfo } from "node:net";
import type { Server } from "node:http";
import { runWorker } from "../src/lib/worker-runtime";

function deferred<T = void>() {
  let resolve!: (value: T | PromiseLike<T>) => void;
  const promise = new Promise<T>((done) => {
    resolve = done;
  });
  return { promise, resolve };
}

function endpoint(server: Server) {
  return `http://127.0.0.1:${(server.address() as AddressInfo).port}/health`;
}

describe("worker deployment lifecycle", () => {
  it("reports readiness only after database work and interrupts idle sleep on shutdown", async () => {
    const listening = deferred<Server>();
    const maintenance = deferred();
    const shutdown = new AbortController();
    const disconnect = vi.fn(async () => {});
    const runOne = vi.fn(async () => false);
    const running = runWorker({
      port: 0,
      pollMs: 60000,
      signal: shutdown.signal,
      maintain: () => maintenance.promise,
      runOne,
      disconnect,
      onListening: listening.resolve,
    });
    try {
      const url = endpoint(await listening.promise);
      expect((await fetch(url)).status).toBe(503);
      maintenance.resolve();
      await vi.waitFor(() => expect(runOne).toHaveBeenCalledOnce());
      expect((await fetch(url)).status).toBe(200);
      shutdown.abort();
      await running;
      expect(disconnect).toHaveBeenCalledOnce();
      expect(runOne).toHaveBeenCalledOnce();
    } finally {
      maintenance.resolve();
      shutdown.abort();
      await running;
    }
  });

  it("finishes an active job before disconnecting and never claims another after shutdown", async () => {
    const listening = deferred<Server>();
    const jobStarted = deferred();
    const jobFinished = deferred();
    const shutdown = new AbortController();
    const disconnect = vi.fn(async () => {});
    const runOne = vi.fn(async () => {
      jobStarted.resolve();
      await jobFinished.promise;
      return true;
    });
    const running = runWorker({
      port: 0,
      pollMs: 10,
      signal: shutdown.signal,
      maintain: async () => {},
      runOne,
      disconnect,
      onListening: listening.resolve,
    });
    try {
      const url = endpoint(await listening.promise);
      await jobStarted.promise;
      shutdown.abort();
      expect((await fetch(url)).status).toBe(503);
      expect(disconnect).not.toHaveBeenCalled();
      jobFinished.resolve();
      await running;
      expect(disconnect).toHaveBeenCalledOnce();
      expect(runOne).toHaveBeenCalledOnce();
    } finally {
      jobFinished.resolve();
      shutdown.abort();
      await running;
    }
  });

  it("closes health and database resources when a polling query fails", async () => {
    const disconnect = vi.fn(async () => {});
    let server: Server | undefined;
    await expect(
      runWorker({
        port: 0,
        pollMs: 10,
        signal: new AbortController().signal,
        maintain: async () => {},
        runOne: async () => {
          throw new Error("Database unavailable");
        },
        disconnect,
        onListening: (value) => {
          server = value;
        },
      }),
    ).rejects.toThrow("Database unavailable");
    expect(disconnect).toHaveBeenCalledOnce();
    expect(server?.listening).toBe(false);
  });
});
