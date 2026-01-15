#!/usr/bin/env python3
"""
Code clone/duplicate detection using jscpd.
Detects copy-paste and similar code patterns across Python and TypeScript.
"""

import subprocess
import json
import sys
import os
from pathlib import Path
import tempfile


def check_jscpd_installed() -> bool:
    """Check if jscpd is installed."""
    try:
        result = subprocess.run(["jscpd", "--version"], capture_output=True, timeout=10)
        return result.returncode == 0
    except (subprocess.TimeoutExpired, FileNotFoundError):
        return False


def run_jscpd(root: str, min_lines: int = 5, min_tokens: int = 50) -> dict:
    """
    Run jscpd to detect code clones.

    Args:
        root: Directory to scan
        min_lines: Minimum duplicate block size in lines
        min_tokens: Minimum duplicate block size in tokens
    """
    with tempfile.TemporaryDirectory() as tmpdir:
        output_file = os.path.join(tmpdir, "jscpd-report.json")

        cmd = [
            "jscpd",
            root,
            "--min-lines", str(min_lines),
            "--min-tokens", str(min_tokens),
            "--reporters", "json",
            "--output", tmpdir,
            "--ignore", "**/node_modules/**,**/.venv/**,**/venv/**,**/__pycache__/**,**/dist/**,**/build/**,**/.git/**",
            "--format", "python,typescript,javascript,typescriptreact,javascriptreact"
        ]

        try:
            subprocess.run(cmd, capture_output=True, timeout=300)

            if os.path.exists(output_file):
                with open(output_file) as f:
                    return json.load(f)
        except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError) as e:
            return {"error": str(e)}

    return {}


def format_clone_report(jscpd_data: dict, root: str) -> dict:
    """Format jscpd output into a more useful report."""
    if "error" in jscpd_data:
        return jscpd_data

    duplicates = jscpd_data.get("duplicates", [])
    statistics = jscpd_data.get("statistics", {})

    # Group duplicates by severity (by lines)
    clones = []
    for dup in duplicates:
        first = dup.get("firstFile", {})
        second = dup.get("secondFile", {})
        lines = dup.get("lines", 0)
        tokens = dup.get("tokens", 0)

        # Make paths relative
        first_path = first.get("name", "").replace(root + "/", "")
        second_path = second.get("name", "").replace(root + "/", "")

        clones.append({
            "lines": lines,
            "tokens": tokens,
            "fragment": dup.get("fragment", "")[:500],  # Truncate long fragments
            "locations": [
                {
                    "file": first_path,
                    "start": first.get("start"),
                    "end": first.get("end")
                },
                {
                    "file": second_path,
                    "start": second.get("start"),
                    "end": second.get("end")
                }
            ]
        })

    # Sort by lines (most significant first)
    clones.sort(key=lambda x: x["lines"], reverse=True)

    # Calculate summary stats
    total_clones = len(clones)
    total_duplicated_lines = statistics.get("total", {}).get("duplicatedLines", 0)
    total_lines = statistics.get("total", {}).get("lines", 0)
    percentage = statistics.get("total", {}).get("percentage", 0)

    return {
        "summary": {
            "total_clones": total_clones,
            "duplicated_lines": total_duplicated_lines,
            "total_lines": total_lines,
            "duplication_percentage": round(percentage, 2)
        },
        "by_format": statistics.get("formats", {}),
        "clones": clones[:25],  # Top 25 most significant
        "refactoring_candidates": [c for c in clones if c["lines"] >= 10][:10]
    }


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    root = os.path.abspath(root)

    min_lines = int(sys.argv[2]) if len(sys.argv) > 2 else 5
    min_tokens = int(sys.argv[3]) if len(sys.argv) > 3 else 50

    if not check_jscpd_installed():
        print(json.dumps({
            "error": "jscpd not installed",
            "install_command": "npm install -g jscpd"
        }))
        sys.exit(1)

    raw_data = run_jscpd(root, min_lines, min_tokens)
    report = format_clone_report(raw_data, root)
    report["root"] = root
    report["settings"] = {"min_lines": min_lines, "min_tokens": min_tokens}

    print(json.dumps(report, indent=2))


if __name__ == "__main__":
    main()
