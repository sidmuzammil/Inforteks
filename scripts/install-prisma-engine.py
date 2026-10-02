#!/usr/bin/env python3
"""Verified official Prisma 7.10.0 engine for Linux/OpenSSL 3 cloud builds.

The upstream rejects the default CLI user agent in some proxy environments.
Use the same authoritative URL with a standard user agent; preserve both hashes.
"""
import gzip
import hashlib
import platform
from pathlib import Path
import urllib.request

ENGINE_COMMIT = "0edf323efd1d98336f3f0a68684b56f689b900d3"
ARCHIVE_SHA256 = "b7210b525a6e592c0d5db7e7d48edbc0f334e14e212af7af11c0d4a8de755a31"
BINARY_SHA256 = "29557c21d47da6f1695ec1a747cb6c607dade5e44e8b3e4fa687bd4dc226956d"
target = Path(".data/tools/schema-engine")
if platform.system() != "Linux" or platform.machine() not in ("x86_64", "AMD64"):
    raise SystemExit("Use Prisma's standard installer on your platform. This helper is Linux x86_64 only.")
if target.exists() and hashlib.sha256(target.read_bytes()).hexdigest() == BINARY_SHA256:
    print("Prisma engine: verified existing binary.")
    raise SystemExit(0)
base = f"https://binaries.prisma.sh/all_commits/{ENGINE_COMMIT}/debian-openssl-3.0.x/schema-engine"
request = urllib.request.Request(base + ".gz", headers={"User-Agent": "Mozilla/5.0"})
with urllib.request.urlopen(request, timeout=90) as response:
    archive = response.read()
if hashlib.sha256(archive).hexdigest() != ARCHIVE_SHA256:
    raise SystemExit("Prisma archive checksum mismatch. Installation stopped.")
binary = gzip.decompress(archive)
if hashlib.sha256(binary).hexdigest() != BINARY_SHA256:
    raise SystemExit("Prisma binary checksum mismatch. Installation stopped.")
target.parent.mkdir(parents=True, exist_ok=True)
target.write_bytes(binary)
target.chmod(0o755)
print("Prisma engine installed with verified compressed and extracted SHA-256 checksums.")
