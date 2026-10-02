#!/usr/bin/env python3
"""Wait for the final local PostgreSQL server, not its initialization socket."""

import argparse
import subprocess
import time


def main():
    parser = argparse.ArgumentParser(description=__doc__)
    parser.add_argument("--container", default="inforteks-postgres")
    parser.add_argument("--timeout", type=float, default=30)
    args = parser.parse_args()
    if not 0 < args.timeout <= 300:
        parser.error("--timeout must be greater than zero and at most 300 seconds")

    # The image's temporary initialization server accepts Unix-socket connections
    # but does not listen on TCP. A query also verifies the intended DB exists.
    command = [
        "docker", "exec", "-e", "PGCONNECT_TIMEOUT=2",
        "-e", "PGOPTIONS=-c statement_timeout=2000", args.container,
        "psql", "-X", "-h", "127.0.0.1", "-p", "5432", "-U", "inforteks",
        "-d", "inforteks", "-v", "ON_ERROR_STOP=1", "-Atqc", "SELECT 1",
    ]
    deadline = time.monotonic() + args.timeout
    while (remaining := deadline - time.monotonic()) > 0:
        try:
            result = subprocess.run(
                command, capture_output=True, text=True, timeout=min(3, remaining)
            )
            if result.returncode == 0 and result.stdout.strip() == "1":
                print("PostgreSQL TCP/database readiness confirmed.")
                return 0
        except subprocess.TimeoutExpired:
            pass
        except FileNotFoundError:
            parser.exit(1, "Cannot check PostgreSQL readiness: docker is unavailable.\n")
        time.sleep(max(0, min(1, deadline - time.monotonic())))

    parser.exit(
        1,
        f"PostgreSQL was not ready within {args.timeout:g}s: expected a successful "
        "TCP query to database inforteks at 127.0.0.1:5432 inside the container. "
        "Inspect the local database container before retrying setup.\n",
    )


if __name__ == "__main__":
    raise SystemExit(main())
