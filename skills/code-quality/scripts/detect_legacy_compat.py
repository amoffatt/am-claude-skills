#!/usr/bin/env python3
"""
Detect legacy/backward compatibility code patterns.

Finds code that was added for backward compatibility that may be candidates
for removal. These patterns add maintenance burden and should be periodically
reviewed.

Usage:
    python detect_legacy_compat.py /path/to/project [--exclude dir1,dir2]
"""

import argparse
import json
import os
import re
import sys
from pathlib import Path
from dataclasses import dataclass, field
from typing import Iterator, Optional

# Add parent directory to path for shared lib imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from lib import EXCLUDE_DIRS


@dataclass
class LegacyPattern:
    """A detected legacy compatibility pattern."""
    file: str
    line: int
    pattern_type: str
    code: str
    context: str = ""  # Surrounding lines for context


@dataclass
class LegacyReport:
    """Report of legacy compatibility patterns found."""
    root: str
    files_analyzed: int = 0
    patterns: list[LegacyPattern] = field(default_factory=list)

    def to_dict(self) -> dict:
        return {
            "root": self.root,
            "files_analyzed": self.files_analyzed,
            "total_patterns": len(self.patterns),
            "by_type": self._group_by_type(),
            "patterns": [
                {
                    "file": p.file,
                    "line": p.line,
                    "type": p.pattern_type,
                    "code": p.code,
                    "context": p.context,
                }
                for p in self.patterns
            ],
        }

    def _group_by_type(self) -> dict[str, int]:
        counts: dict[str, int] = {}
        for p in self.patterns:
            counts[p.pattern_type] = counts.get(p.pattern_type, 0) + 1
        return dict(sorted(counts.items(), key=lambda x: -x[1]))


# Regex patterns for detecting legacy code
LEGACY_COMMENT_PATTERNS = [
    # Comments indicating legacy/compat code
    (r'#\s*(?:backward[s]?\s*)?compat(?:ibility)?', 'compat_comment'),
    (r'#\s*legacy', 'legacy_comment'),
    (r'#\s*deprecated', 'deprecated_comment'),
    (r'#\s*TODO:?\s*remove', 'todo_remove_comment'),
    (r'#\s*FIXME:?\s*remove', 'fixme_remove_comment'),
    (r'#\s*for\s+(?:backward[s]?\s*)?compat(?:ibility)?', 'compat_comment'),
    (r'#\s*kept\s+for\s+(?:backward[s]?\s*)?compat', 'compat_comment'),
    (r'#\s*alias\s+for', 'alias_comment'),
    (r'#\s*(?:re-?)?export(?:ed)?\s+for', 'reexport_comment'),
]

LEGACY_CODE_PATTERNS = [
    # Unused variable aliases (e.g., _old_name = new_name)
    (r'^(\s*)_(\w+)\s*=\s*(\w+)\s*$', 'unused_alias'),
    # Explicit backward compat aliases
    (r'^(\s*)(\w+)\s*=\s*(\w+)\s*#.*(?:compat|legacy|deprecated)', 'compat_alias'),
    # Re-exports with "as" for old names
    (r'from\s+\S+\s+import\s+\w+\s+as\s+(?:old_|legacy_|_)\w+', 'legacy_import_alias'),
    # Deprecation warnings
    (r'warnings\.warn\s*\([^)]*(?:deprecat|compat|legacy)', 'deprecation_warning'),
    (r'DeprecationWarning', 'deprecation_warning'),
    (r'PendingDeprecationWarning', 'deprecation_warning'),
    # Type alias patterns for compat
    (r':\s*TypeAlias\s*=.*#.*(?:compat|legacy)', 'type_alias_compat'),
    # Version checks (often for compat)
    (r'sys\.version_info\s*[<>=]', 'version_check'),
    (r'if\s+(?:sys\.)?version', 'version_check'),
    # Feature detection patterns
    (r'hasattr\s*\(\s*\w+\s*,\s*[\'\"]\w+[\'\"]\s*\)', 'feature_detection'),
    (r'getattr\s*\(\s*\w+\s*,\s*[\'\"]\w+[\'\"]\s*,\s*None\s*\)', 'feature_detection'),
    # Try/except ImportError (often for compat imports)
    (r'except\s+ImportError', 'import_fallback'),
    # Polyfill patterns
    (r'(?:polyfill|shim|fallback)', 'polyfill'),
]

# TypeScript/JavaScript patterns
TS_LEGACY_PATTERNS = [
    (r'//\s*(?:backward[s]?\s*)?compat(?:ibility)?', 'compat_comment'),
    (r'//\s*legacy', 'legacy_comment'),
    (r'//\s*deprecated', 'deprecated_comment'),
    (r'//\s*TODO:?\s*remove', 'todo_remove_comment'),
    (r'@deprecated', 'deprecated_decorator'),
    (r'console\.warn\s*\([^)]*(?:deprecat|compat|legacy)', 'deprecation_warning'),
    # Re-exports for compat
    (r'export\s*\{[^}]*\}\s*from\s*[\'"][^\'"]+[\'"];\s*//.*(?:compat|legacy)', 'reexport_compat'),
    # Type alias exports
    (r'export\s+type\s+\w+\s*=.*//.*(?:compat|legacy)', 'type_alias_compat'),
]


def get_python_files(root: Path, exclude_dirs: set[str]) -> Iterator[Path]:
    """Yield Python files, excluding specified directories."""
    all_excluded = exclude_dirs | EXCLUDE_DIRS

    for path in root.rglob('*.py'):
        if not any(excluded in path.parts for excluded in all_excluded):
            yield path


def get_ts_files(root: Path, exclude_dirs: set[str]) -> Iterator[Path]:
    """Yield TypeScript/JavaScript files."""
    all_excluded = exclude_dirs | EXCLUDE_DIRS

    for ext in ['*.ts', '*.tsx', '*.js', '*.jsx']:
        for path in root.rglob(ext):
            if not any(excluded in path.parts for excluded in all_excluded):
                yield path


def analyze_file(
    file_path: Path,
    patterns: list[tuple[str, str]],
    root: Path
) -> list[LegacyPattern]:
    """Analyze a single file for legacy patterns."""
    results = []

    try:
        content = file_path.read_text(encoding='utf-8', errors='ignore')
        lines = content.split('\n')
    except Exception:
        return results

    rel_path = str(file_path.relative_to(root))

    for i, line in enumerate(lines, 1):
        for pattern, pattern_type in patterns:
            if re.search(pattern, line, re.IGNORECASE):
                # Get context (2 lines before and after)
                start = max(0, i - 3)
                end = min(len(lines), i + 2)
                context_lines = lines[start:end]
                context = '\n'.join(f"{start + j + 1}: {l}" for j, l in enumerate(context_lines))

                results.append(LegacyPattern(
                    file=rel_path,
                    line=i,
                    pattern_type=pattern_type,
                    code=line.strip(),
                    context=context,
                ))
                break  # Only report first matching pattern per line

    return results


def analyze_project(root: str, exclude: Optional[list[str]] = None) -> LegacyReport:
    """Analyze a project for legacy compatibility patterns."""
    root_path = Path(root).resolve()
    exclude_dirs = set(exclude) if exclude else set()

    report = LegacyReport(root=str(root_path))

    # Analyze Python files
    python_patterns = LEGACY_COMMENT_PATTERNS + LEGACY_CODE_PATTERNS
    for file_path in get_python_files(root_path, exclude_dirs):
        report.files_analyzed += 1
        patterns = analyze_file(file_path, python_patterns, root_path)
        report.patterns.extend(patterns)

    # Analyze TypeScript/JavaScript files
    for file_path in get_ts_files(root_path, exclude_dirs):
        report.files_analyzed += 1
        patterns = analyze_file(file_path, TS_LEGACY_PATTERNS, root_path)
        report.patterns.extend(patterns)

    # Sort by file and line
    report.patterns.sort(key=lambda p: (p.file, p.line))

    return report


def main():
    parser = argparse.ArgumentParser(
        description='Detect legacy/backward compatibility code patterns'
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

    args = parser.parse_args()
    exclude = [d.strip() for d in args.exclude.split(',') if d.strip()]

    report = analyze_project(args.path, exclude)

    if args.json:
        print(json.dumps(report.to_dict(), indent=2))
    else:
        # Human-readable output
        print(f"\nLegacy Compatibility Analysis: {report.root}")
        print(f"Files analyzed: {report.files_analyzed}")
        print(f"Patterns found: {len(report.patterns)}")

        if report.patterns:
            print("\n--- By Type ---")
            for ptype, count in report._group_by_type().items():
                print(f"  {ptype}: {count}")

            print("\n--- Patterns Found ---")
            for p in report.patterns:
                print(f"\n{p.file}:{p.line} [{p.pattern_type}]")
                print(f"  {p.code}")

    return 0 if not report.patterns else 1


if __name__ == '__main__':
    sys.exit(main())
