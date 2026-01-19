#!/usr/bin/env python3
"""
TypeScript/JavaScript code quality analyzer.
Runs ESLint, TypeScript compiler checks, and identifies improvement opportunities.
"""

import subprocess
import json
import sys
import os
from pathlib import Path

# Add parent directory to path for shared lib imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from lib import find_typescript_files as find_ts_files


def find_package_json(root: str) -> str | None:
    """Find the nearest package.json."""
    for path in [root] + [str(p) for p in Path(root).parents]:
        pkg = os.path.join(path, "package.json")
        if os.path.exists(pkg):
            return pkg
    return None


def run_eslint(root: str) -> dict:
    """Run ESLint with JSON output."""
    try:
        result = subprocess.run(
            ["npx", "eslint", root, "--format=json", "--ext", ".ts,.tsx,.js,.jsx",
             "--ignore-pattern", "node_modules/", "--ignore-pattern", "dist/"],
            capture_output=True, text=True, timeout=120, cwd=root
        )
        if result.stdout.strip():
            data = json.loads(result.stdout)

            # Aggregate results
            total_errors = 0
            total_warnings = 0
            files_with_issues = 0
            by_rule = {}
            top_issues = []

            for file_result in data:
                messages = file_result.get("messages", [])
                if messages:
                    files_with_issues += 1

                for msg in messages:
                    if msg.get("severity") == 2:
                        total_errors += 1
                    else:
                        total_warnings += 1

                    rule = msg.get("ruleId", "unknown")
                    if rule:
                        by_rule[rule] = by_rule.get(rule, 0) + 1

                    if len(top_issues) < 20:
                        top_issues.append({
                            "file": file_result.get("filePath", "").replace(root + "/", ""),
                            "line": msg.get("line"),
                            "column": msg.get("column"),
                            "rule": rule,
                            "message": msg.get("message"),
                            "severity": "error" if msg.get("severity") == 2 else "warning",
                            "fixable": msg.get("fix") is not None
                        })

            fixable_count = sum(1 for i in top_issues if i.get("fixable"))

            return {
                "total_errors": total_errors,
                "total_warnings": total_warnings,
                "files_with_issues": files_with_issues,
                "by_rule": dict(sorted(by_rule.items(), key=lambda x: -x[1])[:15]),
                "top_issues": top_issues,
                "fixable_count": fixable_count,
                "fix_command": f"npx eslint {root} --fix"
            }
    except (subprocess.TimeoutExpired, FileNotFoundError, json.JSONDecodeError):
        pass
    return {}


def run_tsc_check(root: str) -> dict:
    """Run TypeScript compiler in check mode."""
    try:
        result = subprocess.run(
            ["npx", "tsc", "--noEmit", "--pretty", "false"],
            capture_output=True, text=True, timeout=120, cwd=root
        )

        # Parse tsc output (not JSON by default)
        errors = []
        for line in result.stdout.split("\n") + result.stderr.split("\n"):
            if ": error TS" in line:
                # Format: file(line,col): error TSxxxx: message
                parts = line.split(": error ")
                if len(parts) >= 2:
                    location = parts[0]
                    error_msg = parts[1]
                    errors.append({
                        "location": location.replace(root + "/", ""),
                        "error": error_msg[:200]
                    })

        return {
            "total_errors": len(errors),
            "errors": errors[:20],
            "has_tsconfig": os.path.exists(os.path.join(root, "tsconfig.json"))
        }
    except (subprocess.TimeoutExpired, FileNotFoundError):
        pass
    return {}


def analyze_imports(files: list[str], root: str) -> dict:
    """Analyze import patterns to find potential issues."""
    circular_candidates = []
    large_imports = []

    for filepath in files[:50]:  # Limit for speed
        try:
            with open(filepath, 'r') as f:
                content = f.read()

            # Count imports
            import_count = content.count("import ")
            if import_count > 20:
                large_imports.append({
                    "file": filepath.replace(root + "/", ""),
                    "import_count": import_count
                })
        except Exception:
            pass

    return {
        "files_with_many_imports": sorted(large_imports, key=lambda x: -x["import_count"])[:10]
    }


def check_package_json(root: str) -> dict:
    """Check package.json for potential issues."""
    pkg_path = find_package_json(root)
    if not pkg_path:
        return {"error": "No package.json found"}

    try:
        with open(pkg_path) as f:
            pkg = json.load(f)

        deps = pkg.get("dependencies", {})
        dev_deps = pkg.get("devDependencies", {})

        # Check for common issues
        issues = []

        # Check for misplaced dev dependencies
        dev_in_prod = ["eslint", "prettier", "jest", "typescript", "@types/"]
        for dep in deps:
            for pattern in dev_in_prod:
                if pattern in dep:
                    issues.append(f"{dep} should probably be in devDependencies")

        return {
            "dependencies_count": len(deps),
            "devDependencies_count": len(dev_deps),
            "potential_issues": issues[:10],
            "has_eslint_config": any(
                os.path.exists(os.path.join(root, f))
                for f in [".eslintrc", ".eslintrc.js", ".eslintrc.json", "eslint.config.js"]
            ),
            "has_prettier": any(
                os.path.exists(os.path.join(root, f))
                for f in [".prettierrc", ".prettierrc.js", "prettier.config.js"]
            )
        }
    except (json.JSONDecodeError, FileNotFoundError):
        return {"error": "Failed to parse package.json"}


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    root = os.path.abspath(root)

    # Find TypeScript project directory (where package.json is)
    pkg_json = find_package_json(root)
    if pkg_json:
        project_root = os.path.dirname(pkg_json)
    else:
        project_root = root

    ts_files = find_ts_files(root)
    if not ts_files:
        print(json.dumps({"error": "No TypeScript/JavaScript files found", "root": root}))
        sys.exit(0)

    results = {
        "language": "typescript",
        "root": root,
        "project_root": project_root,
        "files_found": len(ts_files),
        "eslint": {},
        "typescript": {},
        "imports": {},
        "package": {},
        "tools_available": {
            "eslint": False,
            "typescript": False
        }
    }

    # Run ESLint
    eslint_results = run_eslint(project_root)
    if eslint_results:
        results["tools_available"]["eslint"] = True
        results["eslint"] = eslint_results

    # Run TypeScript check
    tsc_results = run_tsc_check(project_root)
    if tsc_results:
        results["tools_available"]["typescript"] = True
        results["typescript"] = tsc_results

    # Analyze imports
    results["imports"] = analyze_imports(ts_files, root)

    # Check package.json
    results["package"] = check_package_json(project_root)

    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
