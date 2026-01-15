#!/usr/bin/env python3
"""
Python code quality analyzer.
Runs radon (complexity), pylint (linting), ruff (fast linting), and flake8.
Outputs JSON for easy parsing and actionable recommendations.
"""

import subprocess
import json
import sys
import os
from pathlib import Path

# Add parent directory to path for shared lib imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from lib import find_python_files, find_python_dirs


def _run_radon(cmd_args: list[str], paths: list[str], timeout: int = 120) -> dict:
    """Run a radon command and return parsed JSON output."""
    try:
        result = subprocess.run(
            cmd_args + paths,
            capture_output=True, text=True, timeout=timeout
        )
        if result.returncode == 0 and result.stdout.strip():
            return json.loads(result.stdout)
    except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError):
        pass
    return {}


def run_radon_cc(paths: list[str]) -> dict:
    """Run radon cyclomatic complexity analysis."""
    return _run_radon(["radon", "cc", "-j", "-a"], paths)


def run_radon_mi(paths: list[str]) -> dict:
    """Run radon maintainability index analysis."""
    return _run_radon(["radon", "mi", "-j"], paths)


def run_pylint_duplicates(paths: list[str]) -> list[dict]:
    """Run pylint duplicate code detection."""
    duplicates = []
    try:
        result = subprocess.run(
            ["pylint", "--disable=all", "--enable=duplicate-code", "--output-format=json"] + paths,
            capture_output=True, text=True, timeout=180
        )
        if result.stdout.strip():
            messages = json.loads(result.stdout)
            duplicates = [m for m in messages if m.get("symbol") == "duplicate-code"]
    except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError):
        pass
    return duplicates


def run_pylint_full(paths: list[str]) -> dict:
    """Run full pylint analysis."""
    try:
        result = subprocess.run(
            ["pylint", "--output-format=json", "--max-line-length=120"] + paths,
            capture_output=True, text=True, timeout=300
        )
        if result.stdout.strip():
            messages = json.loads(result.stdout)
            # Group by type
            by_type = {"error": [], "warning": [], "convention": [], "refactor": []}
            for msg in messages:
                msg_type = msg.get("type", "warning")
                if msg_type in by_type:
                    by_type[msg_type].append(msg)
            return {
                "total": len(messages),
                "by_type": {k: len(v) for k, v in by_type.items()},
                "top_issues": messages[:20]
            }
    except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError):
        pass
    return {}


def analyze_complexity(cc_data: dict) -> dict:
    """Analyze complexity data and identify problem areas."""
    high_complexity = []  # C, D, E, F grades
    total_functions = 0

    for filepath, functions in cc_data.items():
        if isinstance(functions, list):
            for func in functions:
                total_functions += 1
                complexity = func.get("complexity", 0)
                rank = func.get("rank", "A")
                if rank in ["C", "D", "E", "F"]:
                    high_complexity.append({
                        "file": filepath,
                        "name": func.get("name"),
                        "type": func.get("type"),
                        "complexity": complexity,
                        "rank": rank,
                        "lineno": func.get("lineno")
                    })

    return {
        "total_functions": total_functions,
        "high_complexity_count": len(high_complexity),
        "high_complexity": sorted(high_complexity, key=lambda x: x["complexity"], reverse=True)[:15]
    }


def analyze_maintainability(mi_data: dict) -> dict:
    """Analyze maintainability index data."""
    low_mi = []  # MI < 65 is concerning, < 50 is poor

    for filepath, mi_info in mi_data.items():
        if isinstance(mi_info, dict):
            mi = mi_info.get("mi", 100)
            rank = mi_info.get("rank", "A")
            if mi < 65:
                low_mi.append({
                    "file": filepath,
                    "mi": round(mi, 2),
                    "rank": rank
                })

    return {
        "files_analyzed": len(mi_data),
        "low_maintainability_count": len(low_mi),
        "low_maintainability": sorted(low_mi, key=lambda x: x["mi"])[:15]
    }


def run_ruff(root: str) -> dict:
    """Run ruff for fast Python linting with auto-fix suggestions."""
    try:
        # Get issues
        result = subprocess.run(
            ["ruff", "check", root, "--output-format=json", "--ignore", "E501"],
            capture_output=True, text=True, timeout=60
        )
        if result.stdout.strip():
            issues = json.loads(result.stdout)
            # Group by rule
            by_rule = {}
            for issue in issues:
                rule = issue.get("code", "unknown")
                if rule not in by_rule:
                    by_rule[rule] = []
                by_rule[rule].append(issue)

            # Get fixable count
            fixable = [i for i in issues if i.get("fix")]

            return {
                "total_issues": len(issues),
                "fixable_count": len(fixable),
                "by_rule": {k: len(v) for k, v in sorted(by_rule.items(), key=lambda x: -len(x[1]))[:10]},
                "top_issues": issues[:15],
                "fix_command": f"ruff check {root} --fix"
            }
    except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError):
        pass
    return {}


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    root = os.path.abspath(root)

    # Find Python directories and files
    py_dirs = find_python_dirs(root)
    py_files = find_python_files(root)
    if not py_dirs:
        print(json.dumps({"error": "No Python files found", "paths_searched": root}))
        sys.exit(0)

    results = {
        "language": "python",
        "root": root,
        "files_found": len(py_files),
        "complexity": {},
        "maintainability": {},
        "duplicates": [],
        "linting": {},
        "ruff": {},
        "tools_available": {
            "radon": False,
            "pylint": False,
            "ruff": False
        }
    }

    # Run radon complexity
    cc_data = run_radon_cc(py_dirs)
    if cc_data:
        results["tools_available"]["radon"] = True
        results["complexity"] = analyze_complexity(cc_data)

    # Run radon maintainability
    mi_data = run_radon_mi(py_dirs)
    if mi_data:
        results["maintainability"] = analyze_maintainability(mi_data)

    # Run pylint duplicates
    if py_files:
        duplicates = run_pylint_duplicates(py_files[:50])  # Limit files for speed
        if duplicates:
            results["tools_available"]["pylint"] = True
            results["duplicates"] = duplicates[:10]

        # Run full pylint
        lint_results = run_pylint_full(py_files[:30])
        if lint_results:
            results["tools_available"]["pylint"] = True
            results["linting"] = lint_results

    # Run ruff (fast, modern linter)
    ruff_results = run_ruff(root)
    if ruff_results:
        results["tools_available"]["ruff"] = True
        results["ruff"] = ruff_results

    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
