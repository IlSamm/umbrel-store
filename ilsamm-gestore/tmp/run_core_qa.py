from __future__ import annotations

import shutil
import subprocess
import sys
from pathlib import Path


ROOT = Path(__file__).resolve().parents[1]


def run(command: list[str]) -> None:
    print(f"\n> {' '.join(command)}", flush=True)
    subprocess.run(command, cwd=ROOT, check=True)


node = shutil.which("node")
if not node:
    raise RuntimeError("Node.js is required for JavaScript syntax checks")

python = sys.executable
run([python, "-m", "compileall", "-q", "app/backend"])

for script in sorted((ROOT / "app" / "frontend" / "js").rglob("*.js")):
    run([node, "--check", str(script.relative_to(ROOT))])

run([python, "tmp/audit_frontend_architecture.py"])
run([python, "-m", "unittest", "tests.test_payslip_assets", "-v"])
for test_file in [
    "tmp/test_auth_migration.py",
    "tmp/test_fast_sync.py",
    "tmp/test_multiuser.py",
    "tmp/test_platform_features.py",
]:
    run([python, test_file])

print("\nCore QA completed successfully.", flush=True)
