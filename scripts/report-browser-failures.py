"""Emit failure locations without publishing browser traces or credential data."""
import json
import re
import sys
from pathlib import Path


def annotation(message):
    escaped = message.replace("%", "%25").replace("\r", "%0D").replace("\n", "%0A")
    print(f"::error title=Browser check failed::{escaped}")


def visit(suite):
    for spec in suite.get("specs", []):
        for test in spec.get("tests", []):
            for result in test.get("results", []):
                if result.get("status") not in ("failed", "timedOut", "interrupted"):
                    continue
                error = result.get("error", {})
                locations = re.findall(r"tests/browser/[a-zA-Z0-9_-]+\.spec\.ts:\d+(?::\d+)?", error.get("stack", ""))
                location = locations[0] if locations else f"{spec.get('file', 'unknown test')}:{spec.get('line', 0)}"
                # Titles and paths are source-controlled. Never print raw error messages,
                # locator arguments, cookies, page snapshots or authentication responses.
                annotation(f"{spec.get('title', 'Browser test')}: {result['status']} at {location}")
    for child in suite.get("suites", []):
        visit(child)


try:
    report = json.loads(Path(sys.argv[1]).read_text())
except (OSError, ValueError, IndexError):
    annotation("Browser checks failed before producing a JSON report.")
else:
    visit(report)
    if report.get("errors"):
        annotation("The browser runner also reported an error outside a test.")
