"""Shared constants for code quality analysis scripts."""

# Directories to exclude from analysis (common across Python and TypeScript)
EXCLUDE_DIRS = frozenset([
    ".venv",
    "venv",
    "node_modules",
    "__pycache__",
    ".git",
    "dist",
    "build",
    "site-packages",
    ".tox",
    "coverage",
    ".next",
    "out",
])

# File patterns by language
PYTHON_PATTERNS = ["*.py"]
TS_PATTERNS = ["*.ts", "*.tsx", "*.js", "*.jsx"]

# Common output dict keys
KEY_ROOT = "root"
KEY_FILE = "file"
KEY_LINE = "line"
KEY_CODE = "code"
KEY_FILES_ANALYZED = "files_analyzed"
KEY_LANGUAGE = "language"
KEY_ERROR = "error"
KEY_BY_TYPE = "by_type"
