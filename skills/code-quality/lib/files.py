"""Shared file discovery utilities for code quality analysis."""
from __future__ import annotations

from pathlib import Path
from .constants import EXCLUDE_DIRS


def find_python_files(root: str, exclude_dirs: set[str] | None = None) -> list[str]:
    """Find all Python files, excluding common non-source directories."""
    exclude = exclude_dirs or EXCLUDE_DIRS
    files = []
    for path in Path(root).rglob("*.py"):
        if not any(ex in str(path) for ex in exclude):
            files.append(str(path))
    return sorted(files)


def find_python_dirs(root: str, exclude_dirs: set[str] | None = None) -> list[str]:
    """Find directories containing Python files."""
    exclude = exclude_dirs or EXCLUDE_DIRS
    dirs = set()
    for path in Path(root).rglob("*.py"):
        if not any(ex in str(path) for ex in exclude):
            dirs.add(str(path.parent))
    return sorted(dirs)


def find_typescript_files(root: str, exclude_dirs: set[str] | None = None) -> list[str]:
    """Find all TypeScript/JavaScript files, excluding common non-source directories."""
    exclude = exclude_dirs or EXCLUDE_DIRS
    files = []
    for pattern in ["*.ts", "*.tsx", "*.js", "*.jsx"]:
        for path in Path(root).rglob(pattern):
            if not any(ex in str(path) for ex in exclude):
                files.append(str(path))
    return sorted(set(files))


def should_exclude(path: str | Path, exclude_dirs: set[str] | None = None) -> bool:
    """Check if a path should be excluded from analysis."""
    exclude = exclude_dirs or EXCLUDE_DIRS
    path_str = str(path)
    return any(ex in path_str for ex in exclude)
