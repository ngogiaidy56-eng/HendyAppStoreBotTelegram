#!/usr/bin/env python3
"""Safely import this source tree into the HendyAppStoreBotTelegram GitHub repo."""
from __future__ import annotations

import os
import shutil
import subprocess
import sys
from pathlib import Path

REPO_URL = "https://github.com/hendyngo-servers/HendyAppStoreBotTelegram.git"
CLONE_NAME = "HendyAppStoreBotTelegram-git-push"
EXCLUDED_DIRS = {
    ".git", "node_modules", "dist", "coverage", ".wrangler", ".turbo",
    "playwright-report", "test-results", ".bootstrap",
}
EXCLUDED_SUFFIXES = {".pem", ".p12", ".pfx", ".keystore", ".jks"}
EXCLUDED_NAMES = {".env", ".dev.vars", "id_rsa", "id_ed25519"}


def run(args: list[str], cwd: Path | None = None, *, check: bool = True) -> subprocess.CompletedProcess[str]:
    result = subprocess.run(args, cwd=cwd, text=True, capture_output=True)
    if check and result.returncode != 0:
        if result.stdout:
            print(result.stdout, end="")
        if result.stderr:
            print(result.stderr, file=sys.stderr, end="")
        raise RuntimeError(f"Command failed ({result.returncode}): {' '.join(args)}")
    return result


def should_skip_file(name: str) -> bool:
    low = name.lower()
    if name in EXCLUDED_NAMES or Path(name).suffix.lower() in EXCLUDED_SUFFIXES:
        return True
    # Keep documented templates, but never copy environment files containing local values.
    if low.startswith(".env.") and not low.endswith(".example"):
        return True
    return False


def main() -> int:
    source = Path.cwd().resolve()
    if not (source / "package.json").is_file():
        print("Run this script from the extracted HendyAppStoreBotTelegram project root (package.json must exist).", file=sys.stderr)
        return 2

    clone = source.parent / CLONE_NAME
    if clone.exists():
        print(f"Destination already exists: {clone}\nInspect it or rename/remove it, then rerun this script.", file=sys.stderr)
        return 2

    print(f"Cloning {REPO_URL} ...")
    try:
        run(["git", "clone", REPO_URL, str(clone)])

        # Remove only the temporary staging folder created by an interrupted import attempt.
        temporary = clone / ".bootstrap"
        if temporary.exists():
            shutil.rmtree(temporary)

        copied = 0
        for root, dirs, files in os.walk(source):
            root_path = Path(root)
            dirs[:] = sorted(d for d in dirs if d not in EXCLUDED_DIRS)
            for filename in sorted(files):
                if should_skip_file(filename):
                    continue
                source_file = root_path / filename
                rel = source_file.relative_to(source)
                if any(part in EXCLUDED_DIRS for part in rel.parts):
                    continue
                target = clone / rel
                target.parent.mkdir(parents=True, exist_ok=True)
                shutil.copy2(source_file, target)
                copied += 1

        print(f"Copied {copied} source files (excluding local dependencies, builds, secrets and certificates).")
        run(["git", "-C", str(clone), "add", "--all"])
        diff = run(["git", "-C", str(clone), "diff", "--cached", "--quiet"], check=False)
        if diff.returncode == 0:
            print("No changes to commit; repository already matches this source tree.")
        elif diff.returncode == 1:
            name = run(["git", "-C", str(clone), "config", "user.name"], check=False).stdout.strip()
            email = run(["git", "-C", str(clone), "config", "user.email"], check=False).stdout.strip()
            if not name or not email:
                print("Git commit identity is not configured. In this clone, run:\n"
                      '  git config user.name "Your Name"\n'
                      '  git config user.email "you@example.com"\n'
                      "Then rerun the commit/push steps manually from the clone directory:\n"
                      f'  git -C "{clone}" add --all\n'
                      f'  git -C "{clone}" commit -m "feat: import HendyAppStoreBotTelegram source"\n'
                      f'  git -C "{clone}" push origin main', file=sys.stderr)
                return 2
            run(["git", "-C", str(clone), "commit", "-m", "feat: import HendyAppStoreBotTelegram source"])
        else:
            raise RuntimeError("Could not inspect staged changes.")

        print("Pushing main without force-push ...")
        run(["git", "-C", str(clone), "push", "origin", "HEAD:main"])
        print(f"Successfully pushed source to {REPO_URL}")
        print(f"Working clone retained at: {clone}")
        return 0
    except (OSError, RuntimeError) as exc:
        print(f"Import/push failed: {exc}", file=sys.stderr)
        print(f"Any work-in-progress clone is retained at: {clone}", file=sys.stderr)
        return 1


if __name__ == "__main__":
    raise SystemExit(main())
