#!/usr/bin/env python3
"""
Detect dead/unused code in Python and TypeScript/JavaScript projects.

Finds:
- Unused functions/methods
- Unused classes
- Unused variables and imports
- Unreachable code
- Unused exports (TypeScript)

Usage:
    python detect_dead_code.py /path/to/project [--exclude dir1,dir2]
"""

import argparse
import ast
import json
import os
import re
import subprocess
import sys
from pathlib import Path
from collections import defaultdict
from dataclasses import dataclass, field
from typing import Optional

# Add parent directory to path for shared lib imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from lib import EXCLUDE_DIRS


@dataclass
class DeadCodeItem:
    """A detected dead code item."""
    file: str
    line: int
    item_type: str  # function, class, variable, import, export
    name: str
    confidence: str  # high, medium, low
    reason: str


@dataclass
class DeadCodeReport:
    """Report of dead code found."""
    root: str
    language: str
    files_analyzed: int = 0
    items: list = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "root": self.root,
            "language": self.language,
            "files_analyzed": self.files_analyzed,
            "total_items": len(self.items),
            "by_type": self._group_by_type(),
            "by_confidence": self._group_by_confidence(),
            "items": [
                {
                    "file": item.file,
                    "line": item.line,
                    "type": item.item_type,
                    "name": item.name,
                    "confidence": item.confidence,
                    "reason": item.reason,
                }
                for item in self.items
            ],
        }

    def _group_by_type(self) -> dict:
        counts: dict[str, int] = {}
        for item in self.items:
            counts[item.item_type] = counts.get(item.item_type, 0) + 1
        return dict(sorted(counts.items(), key=lambda x: -x[1]))

    def _group_by_confidence(self) -> dict:
        counts: dict[str, int] = {}
        for item in self.items:
            counts[item.confidence] = counts.get(item.confidence, 0) + 1
        return counts


# =============================================================================
# Python Dead Code Detection
# =============================================================================

class PythonDeadCodeAnalyzer(ast.NodeVisitor):
    """AST visitor to find dead code in Python."""

    # Decorators that indicate framework entry points (function is called by framework)
    FRAMEWORK_DECORATORS = {
        'app', 'route', 'get', 'post', 'put', 'delete', 'patch',  # Flask/FastAPI
        'pytest', 'fixture', 'mark',  # pytest
        'property', 'staticmethod', 'classmethod', 'abstractmethod',  # builtins
        'dataclass', 'validator', 'field_validator',  # pydantic/dataclasses
        'celery', 'task', 'shared_task',  # Celery
        'function_name', 'blob_trigger', 'queue_trigger',  # Azure Functions
        'on_event', 'listener', 'handler', 'receiver',  # Event handlers
    }

    def __init__(self, filepath: str, root: str):
        self.filepath = filepath
        self.root = root
        self.rel_path = str(Path(filepath).relative_to(root))

        # Track definitions
        self.defined_functions: dict[str, int] = {}  # name -> line
        self.defined_classes: dict[str, int] = {}
        self.defined_variables: dict[str, int] = {}
        self.imports: dict[str, int] = {}

        # Track usages
        self.used_names: set[str] = set()

        # Results
        self.items: list[DeadCodeItem] = []

        # Context tracking
        self._in_class = False
        self._current_class = None

    def visit_FunctionDef(self, node: ast.FunctionDef):
        self._handle_function(node)

    def visit_AsyncFunctionDef(self, node: ast.AsyncFunctionDef):
        self._handle_function(node)

    def _handle_function(self, node):
        name = node.name
        # Skip private methods in classes, magic methods, and test functions
        if (name.startswith('_') or
            name.startswith('test_') or
            self._in_class):
            self.generic_visit(node)
            return

        # Skip functions with framework decorators (they're called by the framework)
        if self._has_framework_decorator(node):
            self.generic_visit(node)
            return

        self.defined_functions[name] = node.lineno
        self.generic_visit(node)

    def _has_framework_decorator(self, node) -> bool:
        """Check if a function has a decorator indicating it's a framework entry point."""
        for decorator in node.decorator_list:
            # Handle @decorator
            if isinstance(decorator, ast.Name):
                if decorator.id in self.FRAMEWORK_DECORATORS:
                    return True
            # Handle @module.decorator or @app.route(...)
            elif isinstance(decorator, ast.Attribute):
                if decorator.attr in self.FRAMEWORK_DECORATORS:
                    return True
                # Check the base (e.g., 'app' in @app.route)
                if isinstance(decorator.value, ast.Name):
                    if decorator.value.id in self.FRAMEWORK_DECORATORS:
                        return True
            # Handle @decorator(...) calls
            elif isinstance(decorator, ast.Call):
                if isinstance(decorator.func, ast.Name):
                    if decorator.func.id in self.FRAMEWORK_DECORATORS:
                        return True
                elif isinstance(decorator.func, ast.Attribute):
                    if decorator.func.attr in self.FRAMEWORK_DECORATORS:
                        return True
                    if isinstance(decorator.func.value, ast.Name):
                        if decorator.func.value.id in self.FRAMEWORK_DECORATORS:
                            return True
        return False

    def visit_ClassDef(self, node: ast.ClassDef):
        # Skip private classes
        if not node.name.startswith('_'):
            self.defined_classes[node.name] = node.lineno

        # Track that we're in a class
        old_in_class = self._in_class
        self._in_class = True
        self.generic_visit(node)
        self._in_class = old_in_class

    def visit_Import(self, node: ast.Import):
        for alias in node.names:
            name = alias.asname or alias.name.split('.')[0]
            self.imports[name] = node.lineno

    def visit_ImportFrom(self, node: ast.ImportFrom):
        for alias in node.names:
            if alias.name == '*':
                continue
            name = alias.asname or alias.name
            self.imports[name] = node.lineno

    def visit_Name(self, node: ast.Name):
        if isinstance(node.ctx, ast.Load):
            self.used_names.add(node.id)
        self.generic_visit(node)

    def visit_Attribute(self, node: ast.Attribute):
        # Track attribute access for method calls
        self.used_names.add(node.attr)
        self.generic_visit(node)

    def analyze(self, source: str) -> list[DeadCodeItem]:
        """Analyze source code and return dead code items."""
        try:
            tree = ast.parse(source)
        except SyntaxError:
            return []

        self.visit(tree)

        # Check for unreachable code after return/raise
        self._check_unreachable_code(tree)

        # Find unused definitions
        for name, line in self.defined_functions.items():
            if name not in self.used_names:
                self.items.append(DeadCodeItem(
                    file=self.rel_path,
                    line=line,
                    item_type="function",
                    name=name,
                    confidence="medium",
                    reason="Function defined but never called in this file"
                ))

        for name, line in self.defined_classes.items():
            if name not in self.used_names:
                self.items.append(DeadCodeItem(
                    file=self.rel_path,
                    line=line,
                    item_type="class",
                    name=name,
                    confidence="medium",
                    reason="Class defined but never instantiated in this file"
                ))

        for name, line in self.imports.items():
            if name not in self.used_names:
                self.items.append(DeadCodeItem(
                    file=self.rel_path,
                    line=line,
                    item_type="import",
                    name=name,
                    confidence="high",
                    reason="Import never used"
                ))

        return self.items

    def _check_unreachable_code(self, tree: ast.AST):
        """Check for code after return/raise statements."""
        for node in ast.walk(tree):
            if isinstance(node, (ast.FunctionDef, ast.AsyncFunctionDef)):
                body = node.body
                for i, stmt in enumerate(body[:-1]):
                    if isinstance(stmt, (ast.Return, ast.Raise)):
                        # Code exists after return/raise
                        next_stmt = body[i + 1]
                        self.items.append(DeadCodeItem(
                            file=self.rel_path,
                            line=next_stmt.lineno,
                            item_type="unreachable",
                            name=f"code after {'return' if isinstance(stmt, ast.Return) else 'raise'}",
                            confidence="high",
                            reason="Code is unreachable"
                        ))
                        break


def analyze_python_project(root: Path, exclude_dirs: set) -> DeadCodeReport:
    """Analyze a Python project for dead code."""
    report = DeadCodeReport(root=str(root), language="python")
    all_exclude = EXCLUDE_DIRS | exclude_dirs

    # Collect all definitions and usages across files
    all_defined: dict[str, list[tuple[str, int]]] = defaultdict(list)  # name -> [(file, line)]
    all_used: set[str] = set()

    python_files = []
    for path in root.rglob('*.py'):
        if not any(ex in path.parts for ex in all_exclude):
            python_files.append(path)

    for filepath in python_files:
        report.files_analyzed += 1
        try:
            source = filepath.read_text(encoding='utf-8', errors='ignore')
        except Exception:
            continue

        # Skip __init__.py files for unused import detection (they're often re-exports)
        is_init = filepath.name == '__init__.py'

        analyzer = PythonDeadCodeAnalyzer(str(filepath), str(root))
        items = analyzer.analyze(source)

        # Only keep high-confidence items from single-file analysis
        for item in items:
            # Skip unused imports in __init__.py (intentional re-exports)
            if is_init and item.item_type == "import":
                continue
            # Skip __future__ imports
            if item.item_type == "import" and item.name == "annotations":
                continue
            if item.confidence == "high":
                report.items.append(item)

        # Track for cross-file analysis
        for name in analyzer.defined_functions:
            all_defined[name].append((analyzer.rel_path, analyzer.defined_functions[name]))
        for name in analyzer.defined_classes:
            all_defined[name].append((analyzer.rel_path, analyzer.defined_classes[name]))
        all_used.update(analyzer.used_names)

    # Cross-file analysis: find definitions never used anywhere
    for name, locations in all_defined.items():
        if name not in all_used and not name.startswith('_'):
            # Skip test classes (pytest finds them by naming convention)
            if name.startswith('Test'):
                continue
            # Skip common framework entry points
            if name in ('main', 'app', 'handler', 'lambda_handler'):
                continue

            # Check if it might be exported (in __init__.py or __all__)
            for filepath, line in locations:
                if '__init__' not in filepath:
                    # Skip test files for function analysis too
                    if 'test_' in filepath or '_test.py' in filepath:
                        continue

                    report.items.append(DeadCodeItem(
                        file=filepath,
                        line=line,
                        item_type="function" if name[0].islower() else "class",
                        name=name,
                        confidence="high",
                        reason="Never used in entire project"
                    ))

    return report


# =============================================================================
# TypeScript/JavaScript Dead Code Detection
# =============================================================================

def analyze_typescript_project(root: Path, exclude_dirs: set) -> DeadCodeReport:
    """Analyze a TypeScript/JavaScript project for dead code."""
    report = DeadCodeReport(root=str(root), language="typescript")
    all_exclude = EXCLUDE_DIRS | exclude_dirs

    ts_files = []
    for ext in ['*.ts', '*.tsx', '*.js', '*.jsx']:
        for path in root.rglob(ext):
            if not any(ex in path.parts for ex in all_exclude):
                ts_files.append(path)

    report.files_analyzed = len(ts_files)

    if not ts_files:
        return report

    # Try to use ts-prune if available
    ts_prune_results = run_ts_prune(root)
    if ts_prune_results:
        report.items.extend(ts_prune_results)

    # Regex-based analysis for common patterns
    for filepath in ts_files:
        try:
            content = filepath.read_text(encoding='utf-8', errors='ignore')
            rel_path = str(filepath.relative_to(root))
        except Exception:
            continue

        items = analyze_typescript_file(content, rel_path)
        report.items.extend(items)

    return report


def run_ts_prune(root: Path) -> list[DeadCodeItem]:
    """Run ts-prune to find unused exports."""
    items = []
    try:
        result = subprocess.run(
            ['npx', 'ts-prune', '--error'],
            capture_output=True,
            text=True,
            timeout=60,
            cwd=str(root)
        )

        # Parse ts-prune output: file:line - export name
        for line in result.stdout.split('\n'):
            if ' - ' in line and ':' in line:
                match = re.match(r'(.+):(\d+) - (.+)', line.strip())
                if match:
                    filepath, lineno, name = match.groups()
                    # Skip index files (often re-exports)
                    if 'index.' not in filepath:
                        items.append(DeadCodeItem(
                            file=filepath,
                            line=int(lineno),
                            item_type="export",
                            name=name,
                            confidence="high",
                            reason="Exported but never imported"
                        ))
    except (subprocess.TimeoutExpired, FileNotFoundError, subprocess.SubprocessError):
        pass

    return items


def analyze_typescript_file(content: str, rel_path: str) -> list[DeadCodeItem]:
    """Analyze a TypeScript file for dead code patterns."""
    items = []
    lines = content.split('\n')

    # Pattern: commented out code blocks
    in_comment_block = False
    comment_block_start = 0
    comment_lines = 0

    for i, line in enumerate(lines, 1):
        stripped = line.strip()

        # Check for block comments with code
        if '/*' in stripped and '*/' not in stripped:
            in_comment_block = True
            comment_block_start = i
            comment_lines = 0
        elif in_comment_block:
            comment_lines += 1
            if '*/' in stripped:
                in_comment_block = False
                if comment_lines > 5:  # Significant commented block
                    items.append(DeadCodeItem(
                        file=rel_path,
                        line=comment_block_start,
                        item_type="commented_code",
                        name=f"{comment_lines} lines",
                        confidence="low",
                        reason="Large commented code block - consider removing"
                    ))

        # Check for TODO/FIXME about dead code
        if re.search(r'//\s*(TODO|FIXME).*\b(remove|delete|dead|unused)\b', stripped, re.I):
            items.append(DeadCodeItem(
                file=rel_path,
                line=i,
                item_type="todo_remove",
                name=stripped[:60],
                confidence="medium",
                reason="Marked for removal"
            ))

        # Check for console.log left in code (often debug leftovers)
        if re.search(r'\bconsole\.(log|debug|info)\s*\(', stripped):
            # Skip if in a logger or intentional
            if 'logger' not in stripped.lower() and '// keep' not in stripped.lower():
                items.append(DeadCodeItem(
                    file=rel_path,
                    line=i,
                    item_type="debug_code",
                    name="console.log",
                    confidence="low",
                    reason="Debug statement - consider removing for production"
                ))

        # Note: Unreachable code detection for TypeScript requires a proper parser
        # Simple regex-based detection produces too many false positives
        # (e.g., guard clauses like `if (x) return; doSomething();`)
        # Rely on TypeScript compiler and ESLint for this instead.

    return items


# =============================================================================
# Main
# =============================================================================

def detect_project_type(root: Path) -> str:
    """Detect if project is Python, TypeScript, or both."""
    has_python = any(root.rglob('*.py'))
    has_typescript = any(root.rglob('*.ts')) or any(root.rglob('*.tsx'))
    has_javascript = any(root.rglob('*.js')) or any(root.rglob('*.jsx'))

    if has_python and (has_typescript or has_javascript):
        return "mixed"
    elif has_typescript or has_javascript:
        return "typescript"
    elif has_python:
        return "python"
    return "unknown"


def analyze_project(root: str, exclude: Optional[list] = None) -> dict:
    """Analyze a project for dead code."""
    root_path = Path(root).resolve()
    exclude_dirs = set(exclude) if exclude else set()

    project_type = detect_project_type(root_path)

    results = {
        "root": str(root_path),
        "project_type": project_type,
        "python": None,
        "typescript": None,
    }

    if project_type in ("python", "mixed"):
        py_report = analyze_python_project(root_path, exclude_dirs)
        results["python"] = py_report.to_dict()

    if project_type in ("typescript", "mixed"):
        ts_report = analyze_typescript_project(root_path, exclude_dirs)
        results["typescript"] = ts_report.to_dict()

    # Compute totals
    total_items = 0
    if results["python"]:
        total_items += results["python"]["total_items"]
    if results["typescript"]:
        total_items += results["typescript"]["total_items"]

    results["total_dead_code_items"] = total_items

    return results


def main():
    parser = argparse.ArgumentParser(
        description='Detect dead/unused code in Python and TypeScript projects'
    )
    parser.add_argument('path', help='Path to analyze')
    parser.add_argument(
        '--exclude',
        help='Comma-separated directories to exclude',
        default=''
    )
    parser.add_argument(
        '--json',
        action='store_true',
        help='Output as JSON'
    )
    parser.add_argument(
        '--lang',
        choices=['python', 'typescript', 'auto'],
        default='auto',
        help='Language to analyze'
    )

    args = parser.parse_args()
    exclude = [d.strip() for d in args.exclude.split(',') if d.strip()]

    results = analyze_project(args.path, exclude)

    if args.json:
        print(json.dumps(results, indent=2))
    else:
        # Human-readable output
        print(f"\nDead Code Analysis: {results['root']}")
        print(f"Project type: {results['project_type']}")
        print(f"Total dead code items: {results['total_dead_code_items']}")

        for lang in ['python', 'typescript']:
            report = results.get(lang)
            if report:
                print(f"\n--- {lang.upper()} ---")
                print(f"Files analyzed: {report['files_analyzed']}")
                print(f"Items found: {report['total_items']}")

                if report['by_type']:
                    print("\nBy type:")
                    for item_type, count in report['by_type'].items():
                        print(f"  {item_type}: {count}")

                if report['items']:
                    print("\nItems:")
                    for item in report['items'][:20]:
                        conf = f"[{item['confidence']}]"
                        print(f"  {item['file']}:{item['line']} {conf} {item['type']}: {item['name']}")
                        print(f"    -> {item['reason']}")

    return 0 if results['total_dead_code_items'] == 0 else 1


if __name__ == '__main__':
    sys.exit(main())
