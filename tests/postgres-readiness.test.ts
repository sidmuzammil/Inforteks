import { afterEach, describe, expect, it } from "vitest";
import { mkdtempSync, writeFileSync, readFileSync, rmSync } from "node:fs";
import { tmpdir } from "node:os";
import path from "node:path";
import { spawnSync } from "node:child_process";

const directories: string[] = [];
afterEach(() => {
  for (const directory of directories.splice(0))
    rmSync(directory, { recursive: true, force: true });
});

function probe(mode: string, timeout: string) {
  const directory = mkdtempSync(path.join(tmpdir(), "inforteks-readiness-"));
  directories.push(directory);
  const calls = path.join(directory, "calls.jsonl");
  writeFileSync(
    path.join(directory, "docker"),
    `#!/usr/bin/env python3
import json, os, pathlib, sys, time
calls = pathlib.Path(os.environ["READINESS_CALLS"])
count = len(calls.read_text().splitlines()) if calls.exists() else 0
with calls.open("a") as f: f.write(json.dumps(sys.argv[1:]) + "\\n")
# Simulate a socket-ready initialization server that cannot yet serve TCP/DB queries.
if "pg_isready" in sys.argv and "-h" not in sys.argv: sys.exit(0)
mode = os.environ["READINESS_MODE"]
if mode == "hang": time.sleep(60)
if mode == "query-fails" or (mode == "initializing" and count < 2): sys.exit(2)
print("1")
`,
    { mode: 0o700 },
  );
  const result = spawnSync(
    "python3",
    [
      "scripts/wait-for-postgres.py",
      "--container",
      "isolated-review",
      "--timeout",
      timeout,
    ],
    {
      encoding: "utf8",
      timeout: 6000,
      env: {
        ...process.env,
        PATH: `${directory}:${process.env.PATH}`,
        READINESS_CALLS: calls,
        READINESS_MODE: mode,
      },
    },
  );
  return {
    result,
    calls: readFileSync(calls, "utf8")
      .trim()
      .split("\n")
      .map((line) => JSON.parse(line) as string[]),
  };
}

describe("local PostgreSQL startup readiness", () => {
  it("waits through initialization until the intended database answers over TCP", () => {
    const { result, calls } = probe("initializing", "4");
    expect(result.status).toBe(0);
    expect(calls).toHaveLength(3);
    for (const call of calls) {
      expect(call).toContain("isolated-review");
      expect(call.slice(call.indexOf("-h"), call.indexOf("-h") + 2)).toEqual([
        "-h",
        "127.0.0.1",
      ]);
      expect(call.slice(call.indexOf("-d"), call.indexOf("-d") + 2)).toEqual([
        "-d",
        "inforteks",
      ]);
      expect(call).toContain("SELECT 1");
    }
  });
  it.each(["query-fails", "hang"])(
    "fails within the deadline when the database probe %s",
    (mode) => {
      const started = Date.now();
      const { result } = probe(mode, "0.2");
      expect(result.error).toBeUndefined();
      expect(result.status).toBe(1);
      expect(result.stderr).toContain("PostgreSQL was not ready within 0.2s");
      expect(result.stdout).not.toContain("readiness confirmed");
      expect(Date.now() - started).toBeLessThan(3000);
    },
  );
});
