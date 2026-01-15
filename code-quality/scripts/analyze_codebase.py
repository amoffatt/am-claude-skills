#!/usr/bin/env python3
"""
Unified Codebase Analysis

Runs comprehensive code quality analysis for TypeScript/JavaScript or Python projects.
Combines LSP-based semantic analysis with pattern detection.

Usage:
    python analyze_codebase.py <project-path> [options]

Options:
    --lang <ts|py>     Force language (auto-detected by default)
    --json             Output as JSON
    --quick            Skip slow LSP analysis, only run pattern detection
    --analysis <type>  Run specific analysis type:
                         patterns   - Magic strings, similar code, duplicates
                         lsp        - Unused symbols, hotspots, similar types
                         imports    - Circular deps, heavy imports
                         all        - Everything (default)

Examples:
    python analyze_codebase.py .
    python analyze_codebase.py ./src --quick
    python analyze_codebase.py . --analysis patterns
"""

import argparse
import json
import os
import shutil
import subprocess
import sys
from pathlib import Path
from typing import Optional


def detect_language(project_path: Path) -> str:
    """Auto-detect project language based on config files and file counts."""
    # Check for config files
    if (project_path / "package.json").exists() or (project_path / "tsconfig.json").exists():
        return "ts"
    if (project_path / "requirements.txt").exists() or (project_path / "pyproject.toml").exists():
        return "py"

    # Count files
    ts_count = len(list(project_path.rglob("*.ts"))) + len(list(project_path.rglob("*.tsx")))
    py_count = len(list(project_path.rglob("*.py")))

    return "ts" if ts_count > py_count else "py"


def find_command(cmd: str) -> Optional[str]:
    """Find command in PATH."""
    return shutil.which(cmd)


def run_subprocess(cmd: list[str], env: Optional[dict] = None, cwd: Optional[Path] = None) -> tuple[int, str, str]:
    """Run subprocess and capture output."""
    merged_env = os.environ.copy()
    if env:
        merged_env.update(env)

    try:
        result = subprocess.run(
            cmd,
            capture_output=True,
            text=True,
            env=merged_env,
            cwd=cwd,
            timeout=300  # 5 minute timeout
        )
        return result.returncode, result.stdout, result.stderr
    except subprocess.TimeoutExpired:
        return 1, "", "Command timed out"
    except Exception as e:
        return 1, "", str(e)


class CodebaseAnalyzer:
    def __init__(self, project_path: Path, lang: str, json_output: bool, quick: bool):
        self.project_path = project_path.resolve()
        self.lang = lang
        self.json_output = json_output
        self.quick = quick
        self.script_dir = Path(__file__).parent.resolve()
        self.results = {
            "project": str(self.project_path),
            "language": self.lang,
            "analyses": {}
        }

    def _handle_script_result(self, success: bool, output: str, name: str) -> dict:
        """Handle script execution result with consistent error handling and output parsing."""
        if not success:
            print(f"Warning: {name} failed: {output}", file=sys.stderr)
            return {"error": output}

        if self.json_output:
            try:
                return json.loads(output)
            except json.JSONDecodeError:
                return {"raw_output": output}
        else:
            print(output)
            return {"completed": True}

    def _get_node_env(self) -> dict:
        """Get environment with NODE_PATH set to project's node_modules."""
        env = {}
        # Look for node_modules in project path and parent directories
        search_path = self.project_path
        for _ in range(5):  # Check up to 5 levels
            node_modules = search_path / "node_modules"
            if node_modules.exists():
                env["NODE_PATH"] = str(node_modules)
                break
            parent = search_path.parent
            if parent == search_path:  # Reached root
                break
            search_path = parent
        return env

    def _run_tsx_script(self, script_name: str, args: list[str] = None) -> tuple[bool, str]:
        """Run a TypeScript script using tsx or npx tsx."""
        script_path = self.script_dir / script_name
        if not script_path.exists():
            return False, f"Script not found: {script_path}"

        args = args or []
        env = self._get_node_env()

        # Try tsx directly first
        tsx_cmd = find_command("tsx")
        if tsx_cmd:
            cmd = [tsx_cmd, str(script_path)] + args
        else:
            # Fall back to npx tsx
            npx_cmd = find_command("npx")
            if not npx_cmd:
                return False, "Neither tsx nor npx found. Install with: npm install -g tsx"
            cmd = [npx_cmd, "tsx", str(script_path)] + args

        code, stdout, stderr = run_subprocess(cmd, env=env, cwd=self.project_path)

        if code != 0:
            return False, stderr or stdout
        return True, stdout

    def _run_python_script(self, script_name: str, args: list[str] = None) -> tuple[bool, str]:
        """Run a Python script."""
        script_path = self.script_dir / script_name
        if not script_path.exists():
            return False, f"Script not found: {script_path}"

        args = args or []
        cmd = [sys.executable, str(script_path)] + args

        code, stdout, stderr = run_subprocess(cmd)

        if code != 0:
            return False, stderr or stdout
        return True, stdout

    def run_ts_patterns(self) -> dict:
        """Run TypeScript/React pattern detection."""
        print("[1/3] Running TypeScript pattern detection...", file=sys.stderr)

        args = [str(self.project_path)]
        if self.json_output:
            args.append("--json")

        success, output = self._run_tsx_script("detect_ts_patterns.ts", args)
        return self._handle_script_result(success, output, "TS pattern detection")

    def run_py_patterns(self) -> dict:
        """Run Python pattern detection."""
        print("[1/3] Running Python pattern detection...", file=sys.stderr)

        success, output = self._run_python_script("detect_similar_patterns.py", [str(self.project_path)])
        return self._handle_script_result(success, output, "Python pattern detection")

    def run_clone_detection(self) -> dict:
        """Run clone detection using jscpd."""
        print("[2/3] Running clone detection...", file=sys.stderr)

        success, output = self._run_python_script("detect_clones.py", [str(self.project_path)])
        return self._handle_script_result(success, output, "Clone detection")

    def run_lsp_analysis(self) -> dict:
        """Run LSP-based semantic analysis."""
        if self.quick:
            print("[3/3] Skipping LSP analysis (--quick mode)", file=sys.stderr)
            return {"skipped": True}

        print("[3/3] Running LSP semantic analysis...", file=sys.stderr)

        args = [str(self.project_path)]
        if self.lang == "py":
            args.extend(["--language", "py"])
        if self.json_output:
            args.extend(["--output", "json"])

        success, output = self._run_tsx_script("analyze_with_lsp.ts", args)
        return self._handle_script_result(success, output, "LSP analysis")

    def run_patterns(self) -> dict:
        """Run pattern detection for the detected language."""
        if self.lang == "ts":
            return self.run_ts_patterns()
        else:
            return self.run_py_patterns()

    def run_all(self) -> dict:
        """Run all analyses."""
        self.results["analyses"]["patterns"] = self.run_patterns()
        print("", file=sys.stderr)
        self.results["analyses"]["clones"] = self.run_clone_detection()
        print("", file=sys.stderr)
        self.results["analyses"]["lsp"] = self.run_lsp_analysis()
        return self.results

    def run_analysis(self, analysis_type: str) -> dict:
        """Run specified analysis type."""
        if analysis_type == "patterns":
            self.results["analyses"]["patterns"] = self.run_patterns()
        elif analysis_type == "lsp":
            self.results["analyses"]["lsp"] = self.run_lsp_analysis()
        elif analysis_type == "imports":
            # For imports, we run TS patterns and filter to import-related output
            if self.lang == "ts":
                self.results["analyses"]["imports"] = self.run_ts_patterns()
        elif analysis_type == "clones":
            self.results["analyses"]["clones"] = self.run_clone_detection()
        else:  # all
            return self.run_all()

        return self.results


def main():
    parser = argparse.ArgumentParser(
        description="Unified codebase analysis for TypeScript/JavaScript and Python projects",
        formatter_class=argparse.RawDescriptionHelpFormatter,
        epilog="""
Examples:
    python analyze_codebase.py .
    python analyze_codebase.py ./src --quick
    python analyze_codebase.py . --analysis patterns --json
        """
    )
    parser.add_argument("project_path", nargs="?", default=".", help="Path to project (default: .)")
    parser.add_argument("--lang", choices=["ts", "py"], help="Force language (auto-detected by default)")
    parser.add_argument("--json", action="store_true", help="Output as JSON")
    parser.add_argument("--quick", action="store_true", help="Skip slow LSP analysis")
    parser.add_argument(
        "--analysis",
        choices=["patterns", "lsp", "imports", "clones", "all"],
        default="all",
        help="Analysis type to run (default: all)"
    )

    args = parser.parse_args()

    project_path = Path(args.project_path)
    if not project_path.exists():
        print(f"Error: Path not found: {project_path}", file=sys.stderr)
        sys.exit(1)

    # Detect language if not specified
    lang = args.lang or detect_language(project_path)

    print("=== Codebase Analysis ===", file=sys.stderr)
    print(f"Project: {project_path.resolve()}", file=sys.stderr)
    print(f"Language: {lang}", file=sys.stderr)
    print(f"Analysis: {args.analysis}", file=sys.stderr)
    print("", file=sys.stderr)

    analyzer = CodebaseAnalyzer(
        project_path=project_path,
        lang=lang,
        json_output=args.json,
        quick=args.quick
    )

    results = analyzer.run_analysis(args.analysis)

    if args.json:
        print(json.dumps(results, indent=2))

    print("", file=sys.stderr)
    print("Analysis complete.", file=sys.stderr)


if __name__ == "__main__":
    main()
