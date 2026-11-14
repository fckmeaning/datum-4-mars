"""Rebuild the external Jezero reference build (kept in ops/external/jezero_build; NOT served by the product).

Used only as a development reference for the Jezero dataset (external project, used with the owners' permission, decision
D-16; credit goes in the presentation and AI disclosure only). Its Apache-2.0 notices stay with the build. This script copies a
checkout of that repository, adds the deep-link patch (?go=site, ?go=helmet), installs its dependencies WITHOUT running install
scripts, builds it with Vite and copies dist/ into ops/external/jezero_build.

Run: .venv\\Scripts\\python.exe ops\\build_jezero.py --src <path to the external checkout>
The result is about 52 MB (the HiRISE, CTX and MOLA rasters are in public/data of that repository).
"""

from __future__ import annotations

import argparse
import shutil
import subprocess
import sys
import tempfile
from pathlib import Path

ROOT = Path(__file__).resolve().parents[1]
DEST = ROOT / "ops" / "external" / "jezero_build"

ANCHOR = "    if (new URLSearchParams(location.search).has('autopilot')) setTimeout(() => this.director.start(), 1200);"
PATCH = """
    // deep link used by the host app: ?go=site opens the Marswalk zone, ?go=helmet also puts the helmet on
    const go = new URLSearchParams(location.search).get('go');
    if (go === 'site' || go === 'helmet') {
      setTimeout(async () => {
        await this.descendToJezero();
        await this.enterSite();
        if (go === 'helmet') this.fpv?.enter();
      }, 1500);
    }"""


def run(cmd: list[str], cwd: Path) -> None:
    print("+", " ".join(cmd))
    # shell=True so that npm.cmd / npx.cmd resolve on Windows
    subprocess.run(" ".join(cmd), cwd=cwd, check=True, shell=True)


def main() -> None:
    ap = argparse.ArgumentParser()
    ap.add_argument("--src", required=True, type=Path, help="checkout of the-sol-explorers")
    args = ap.parse_args()
    if not (args.src / "package.json").exists():
        sys.exit("--src must be a checkout of the-sol-explorers (package.json not found)")

    with tempfile.TemporaryDirectory() as tmp:
        work = Path(tmp) / "build"
        shutil.copytree(args.src, work, ignore=shutil.ignore_patterns(".git", "node_modules", "dist"))
        main_js = work / "src" / "main.js"
        text = main_js.read_text(encoding="utf-8")
        if ANCHOR not in text:
            sys.exit("anchor line not found in src/main.js: the upstream code changed, update ops/build_jezero.py")
        main_js.write_bytes(text.replace(ANCHOR, ANCHOR + PATCH, 1).encode("utf-8"))  # bytes: keep LF line endings
        run(["npm", "ci", "--ignore-scripts", "--no-audit", "--no-fund"], work)
        run(["npx", "vite", "build"], work)
        if DEST.exists():
            shutil.rmtree(DEST)
        shutil.copytree(work / "dist", DEST)
    print("done:", DEST)


if __name__ == "__main__":
    main()
