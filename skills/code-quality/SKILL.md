---
name: code-quality
description: |
  Analyze and improve code quality for Python and TypeScript/JavaScript projects.
  Detects duplicate/similar code, complexity issues, maintainability problems, and linting violations.
  Provides actionable recommendations AND applies fixes. Use when user asks to:
  (1) Find duplicate or copy-paste code
  (2) Analyze code quality or technical debt
  (3) Improve maintainability or reduce complexity
  (4) Apply DRY principles or refactor repetitive code
  (5) Run linting or code analysis tools
  (6) Clean up or improve a codebase
  (7) Find unused code using language server (LSP-based analysis)
  (8) Get type errors and diagnostics from the language server
---

# Code Quality Analysis & Improvement

## Language Support

| Feature | Python | TypeScript/JS |
|---------|--------|---------------|
| Linting & auto-fix | ruff | eslint |
| Formatting | ruff format | prettier |
| Complexity analysis | radon | eslint rules |
| Duplicate detection | detect_clones.py | detect_clones.py |
| Similar patterns | detect_similar_patterns.py | detect_similar_patterns.py |
| Dead code detection | detect_dead_code.py | detect_dead_code.py + ts-prune |
| Legacy compat detection | detect_legacy_compat.py | detect_legacy_compat.py |
| Type checking | mypy/pyright | tsc |
| **LSP analysis** | pyright-langserver | typescript-language-server |

## Quick Start

```bash
# Install tools - Python
uv pip install radon ruff vulture

# Install tools - TypeScript/JS
npm install -g jscpd ts-prune tsx

# Install language servers (for LSP analysis)
npm install -g typescript-language-server typescript  # TypeScript/JS
npm install -g pyright                                # Python

# Quick fixes (run first - handles most issues)
# Python:
ruff check . --fix && ruff format .
# TypeScript:
npx eslint . --fix && npx prettier --write .

# UNIFIED ANALYSIS (recommended - runs all analyses)
python3 ~/.claude/skills/code-quality/scripts/analyze_codebase.py .
python3 ~/.claude/skills/code-quality/scripts/analyze_codebase.py . --quick  # Skip slow LSP analysis
python3 ~/.claude/skills/code-quality/scripts/analyze_codebase.py . --analysis patterns  # Only pattern detection

# Individual analyses
python3 ~/.claude/skills/code-quality/scripts/detect_clones.py .
python3 ~/.claude/skills/code-quality/scripts/detect_similar_patterns.py .  # Python patterns
npx tsx ~/.claude/skills/code-quality/scripts/detect_ts_patterns.ts .       # TypeScript/React patterns
npx tsx ~/.claude/skills/code-quality/scripts/analyze_with_lsp.ts .         # LSP semantic analysis
```

## Unified Analysis (Recommended)

The `analyze_codebase.py` script runs all analyses in one command:

```bash
# Full analysis (patterns + clones + LSP)
python3 ~/.claude/skills/code-quality/scripts/analyze_codebase.py /path/to/project

# Quick mode (skip slow LSP analysis)
python3 ~/.claude/skills/code-quality/scripts/analyze_codebase.py /path/to/project --quick

# Specific analysis only
python3 ~/.claude/skills/code-quality/scripts/analyze_codebase.py . --analysis patterns
python3 ~/.claude/skills/code-quality/scripts/analyze_codebase.py . --analysis lsp
python3 ~/.claude/skills/code-quality/scripts/analyze_codebase.py . --analysis clones

# JSON output for programmatic use
python3 ~/.claude/skills/code-quality/scripts/analyze_codebase.py . --json

# Force specific language
python3 ~/.claude/skills/code-quality/scripts/analyze_codebase.py . --lang ts
python3 ~/.claude/skills/code-quality/scripts/analyze_codebase.py . --lang py
```

The script auto-detects language from `package.json`/`tsconfig.json` (TypeScript) or `requirements.txt`/`pyproject.toml` (Python).

## Workflow

### 1. Auto-Fix First (Linting)

Always start with auto-fix - it's fast and fixes most issues automatically.

**Python:**
```bash
ruff check /path/to/project --fix
ruff format /path/to/project
```

**TypeScript/JavaScript:**
```bash
npx eslint /path/to/project --fix
npx prettier --write /path/to/project
```

Common fixes applied automatically:
- Unused imports
- Unused variables
- Formatting issues
- Import sorting

### 2. Detect Duplicates & Similar Patterns

```bash
# Exact duplicates (copy-paste) - works for both Python and TS
python3 ~/.claude/skills/code-quality/scripts/detect_clones.py /path/to/project

# Similar patterns - Python (method chains, near-duplicates)
python3 ~/.claude/skills/code-quality/scripts/detect_similar_patterns.py /path/to/project

# Similar patterns - TypeScript/React (JSX patterns, hooks, props)
npx tsx ~/.claude/skills/code-quality/scripts/detect_ts_patterns.ts /path/to/project
```

**Python pattern detection finds:**
- `refactoring_candidates` - exact duplicate blocks 10+ lines
- `similar_lines` - repeated patterns with minor variations
- `method_chains` - repeated call chains like `df.filter().sort().groupby()`
- `similar_blocks` - blocks that are 75%+ similar but not identical
- `magic_strings` - hardcoded strings repeated 3+ times that should be constants

**TypeScript/React pattern detection finds:**
- `magicStrings` - repeated string literals (CSS classes, labels, etc.)
- `similarJsxPatterns` - similar JSX structures that could be components
- `similarPropPatterns` - repeated prop combinations across components
- `similarHooksPatterns` - similar hook usage patterns (useEffect, useState, etc.)
- `similarFunctionBodies` - functions with identical implementations
- `importGraph.circular` - circular dependencies between modules
- `importGraph.heavyImports` - files importing 5+ symbols from same package

**Example TypeScript output:**
```
--- Magic Strings (30) ---
  "text-lg font-semibold text-gray-900 mb-4" (14x)
  "Southern Oregon" (14x)

--- Similar JSX Patterns (40) ---
  Pattern (15x):
    <h2 attrs=1>
      [text]
    </h2>

--- Similar Hooks Patterns ---
  useEffect(callback, array[1]) (8x)
  useState(object{3}) (5x)

--- Circular Dependencies ---
  components/A.tsx -> hooks/useData.ts -> components/A.tsx
```

### 3. Detect Dead Code

```bash
python3 ~/.claude/skills/code-quality/scripts/detect_dead_code.py /path/to/project
```

This detects unused code that can be safely removed:
- `function` - Functions/methods never called
- `class` - Classes never instantiated
- `import` - Imports never used
- `export` - Exports never imported (TypeScript)
- `unreachable` - Code after return/throw statements
- `debug_code` - console.log/print statements left in code
- `commented_code` - Large commented-out code blocks

**Confidence levels:**
- `high` - Safe to remove (e.g., unused imports, unreachable code)
- `medium` - Likely safe but verify (e.g., unused functions might be called dynamically)
- `low` - Review before removing (e.g., debug code might be intentional)

### 3.5. LSP-Based Analysis (Most Accurate)

The LSP analyzer uses language servers for semantic code analysis that text-based tools miss. It understands types, references, and symbol relationships.

```bash
# Run all analyses (default)
npx tsx ~/.claude/skills/code-quality/scripts/analyze_with_lsp.ts /path/to/project

# Run specific analyses
npx tsx ~/.claude/skills/code-quality/scripts/analyze_with_lsp.ts . --analysis signatures
npx tsx ~/.claude/skills/code-quality/scripts/analyze_with_lsp.ts . --analysis similar-types --analysis hotspots

# JSON output for programmatic use
npx tsx ~/.claude/skills/code-quality/scripts/analyze_with_lsp.ts . --output json
```

**Analysis types:**

| Analysis | Flag | What it finds |
|----------|------|---------------|
| Unused symbols | `--analysis unused` | Functions/classes with 0 references |
| Similar signatures | `--analysis signatures` | Functions with identical (param types → return type) |
| Co-occurrence | `--analysis cooccurrence` | Symbols always used together (extract to module) |
| Dead parameters | `--analysis dead-params` | Function parameters never used in body |
| Hotspots | `--analysis hotspots` | Symbols referenced from 10+ locations |
| Similar types | `--analysis similar-types` | Types/interfaces with 50%+ shared properties |

**Example output:**

```
--- Functions with Identical Signatures (3 groups) ---
  Signature: (index: number) => string
    - getChartColor (src/components/Chart1.tsx:69)
    - getChartColor (src/components/Chart2.tsx:94)
    - getChartColor (src/components/Chart3.tsx:91)

--- Similar Types/Interfaces (8 pairs) ---
  RegionData <-> RegionBurden (100% similar)
    Shared: label, data
    src/components/Chart1.tsx:14 | src/components/Chart2.tsx:13
```

**When to use each analysis:**

| Goal | Analysis to run |
|------|-----------------|
| Find dead code | `unused` |
| Find duplicate functions to consolidate | `signatures` |
| Find modules to extract | `cooccurrence` |
| Clean up function parameters | `dead-params` |
| Find abstraction opportunities | `hotspots`, `similar-types` |
| Create common base types/interfaces | `similar-types` |

**Requirements:**
```bash
# TypeScript/JavaScript
npm install -g typescript-language-server typescript

# Python
npm install -g pyright
```

### 4. Detect Legacy Compatibility Code

```bash
python3 ~/.claude/skills/code-quality/scripts/detect_legacy_compat.py /path/to/project
```

This detects code added for backward compatibility that may be removable:
- `compat_comment` - Comments mentioning "backward compat", "legacy", etc.
- `deprecated_comment` - Comments marking code as deprecated
- `todo_remove_comment` - TODO/FIXME comments about removing code
- `unused_alias` - Variables like `_old_name = new_name`
- `compat_alias` - Explicit aliases with compat comments
- `deprecation_warning` - Deprecation warning calls
- `version_check` - Python/Node version conditionals
- `import_fallback` - try/except ImportError blocks
- `reexport_compat` - Re-exports kept for backward compatibility

**IMPORTANT: User Prompt Required**

When legacy compatibility patterns are found, ALWAYS ask the user:

> I found {N} legacy/backward compatibility patterns in the codebase:
>
> {list patterns by type with counts}
>
> These patterns add maintenance burden. For each category, would you like to:
> 1. **Remove** - Delete the compatibility code (recommended if no longer needed)
> 2. **Keep** - Leave as-is (if still supporting old versions/APIs)
> 3. **Review** - Show me each instance to decide individually
>
> Which patterns should I address?

Most legacy support code should be removed unless there's a specific reason to maintain backward compatibility. Adding code "just in case" creates technical debt.

### 5. Analyze Complexity

**Python:**
```bash
python3 ~/.claude/skills/code-quality/scripts/analyze_python.py /path/to/project
# Or directly with radon:
radon cc /path/to/project -a -s
```

**TypeScript:**
```bash
python3 ~/.claude/skills/code-quality/scripts/analyze_typescript.py /path/to/project
```

Focus on `high_complexity` functions with rank C or worse.

### 6. Apply Refactorings

See patterns below. After each change:
```bash
# Verify tests still pass
pytest              # Python
npm test            # TypeScript/JS
```

### 7. Final Verification

```bash
# Python
ruff check .
pytest

# TypeScript
npx eslint .
npx tsc --noEmit
npm test
```

## Refactoring Patterns

### Pattern 1: Extract Helper Methods

For complex functions, extract logical chunks into private helper methods.

```python
# BEFORE: Single complex function (complexity 12)
def aggregate_data(self, records):
    # 15 lines collecting items
    # 20 lines processing items
    # 10 lines building result

# AFTER: Main function delegates to helpers (complexity 3)
def aggregate_data(self, records):
    items = self._collect_items(records)
    processed = self._process_items(items)
    return self._build_result(processed)

def _collect_items(self, records):
    # 15 lines - now isolated and testable

def _process_items(self, items):
    # 20 lines - single responsibility

def _build_result(self, processed):
    # 10 lines - clear purpose
```

### Pattern 2: Data-Driven Logic

Replace repetitive conditionals with data structures.

```python
# BEFORE: Repetitive conditionals (complexity 13)
def round_values(self, df):
    if 'price' in df.columns:
        df['price'] = df['price'].round(2)
    if 'rate' in df.columns:
        df['rate'] = df['rate'].round(4)
    if 'count' in df.columns:
        df['count'] = df['count'].round(0)
    # ... 10 more similar blocks

# AFTER: Data-driven (complexity 5)
ROUNDING_RULES = [
    (['price', 'cost', 'amount'], 2),
    (['rate', 'percentage'], 4),
    (['count', 'total'], 0),
]

def round_values(self, df):
    for columns, decimals in self.ROUNDING_RULES:
        for col in columns:
            if col in df.columns:
                df[col] = df[col].round(decimals)
```

### Pattern 3: Early Returns (Guard Clauses)

```python
# BEFORE: Nested conditionals
def process(data):
    if data:
        if data.valid:
            if data.ready:
                # actual logic here
                return result
    return None

# AFTER: Guard clauses
def process(data):
    if not data:
        return None
    if not data.valid:
        return None
    if not data.ready:
        return None

    # actual logic here - no nesting
    return result
```

### Pattern 4: Extract to Shared Module

When duplicate code spans multiple files:

```python
# BEFORE: Same code in reactors/a.py and reactors/b.py

# AFTER: Create lib/helpers.py
# lib/helpers.py
def common_operation(data):
    # shared logic

# reactors/a.py and reactors/b.py
from lib.helpers import common_operation
```

### Pattern 5: Extract Repeated Method Chains

When similar method chains appear multiple times, extract to a function.

```python
# BEFORE: Repeated chain with variations
result1 = df.dropna().reset_index().sort_values('date').head(100)
result2 = df.dropna().reset_index().sort_values('date').tail(50)
result3 = df.dropna().reset_index().sort_values('date').sample(25)

# AFTER: Extract common chain, parameterize the difference
def prepare_df(df):
    """Standard preprocessing: drop nulls, reset index, sort by date."""
    return df.dropna().reset_index().sort_values('date')

result1 = prepare_df(df).head(100)
result2 = prepare_df(df).tail(50)
result3 = prepare_df(df).sample(25)
```

### Pattern 6: Parameterize Similar Lines

When lines differ only by a value, use a loop or mapping.

```python
# BEFORE: Similar lines that all need updating if logic changes
user_df = fetch_and_validate(user_id, 'users', UserSchema)
order_df = fetch_and_validate(order_id, 'orders', OrderSchema)
product_df = fetch_and_validate(product_id, 'products', ProductSchema)
review_df = fetch_and_validate(review_id, 'reviews', ReviewSchema)

# AFTER: Data-driven approach - add new entity = add one line
ENTITY_CONFIG = [
    ('user', 'users', UserSchema),
    ('order', 'orders', OrderSchema),
    ('product', 'products', ProductSchema),
    ('review', 'reviews', ReviewSchema),
]

results = {}
for name, table, schema in ENTITY_CONFIG:
    entity_id = locals()[f'{name}_id']
    results[name] = fetch_and_validate(entity_id, table, schema)
```

### Pattern 7: Builder/Fluent Interface for Complex Construction

When similar multi-step object construction repeats:

```python
# BEFORE: Similar construction scattered around
config1 = Config()
config1.set_timeout(30)
config1.set_retries(3)
config1.set_log_level('INFO')
config1.enable_cache()

config2 = Config()
config2.set_timeout(30)
config2.set_retries(3)
config2.set_log_level('DEBUG')
config2.enable_cache()

# AFTER: Factory function for common defaults
def create_standard_config(log_level='INFO'):
    return (Config()
            .set_timeout(30)
            .set_retries(3)
            .set_log_level(log_level)
            .enable_cache())

config1 = create_standard_config()
config2 = create_standard_config('DEBUG')
```

### Pattern 8: Extract Magic Strings to Constants

Hardcoded strings repeated across files should be constants.

```python
# BEFORE: Magic strings scattered across files
# file1.py
if record["status"] == "success":
    log_result("success", record["timestamp"])

# file2.py
return {"status": "success", "timestamp": now()}

# file3.py
assert response["status"] == "success"

# AFTER: Constants in a shared module
# constants.py
STATUS_KEY = "status"
TIMESTAMP_KEY = "timestamp"
STATUS_SUCCESS = "success"

# file1.py
from constants import STATUS_KEY, TIMESTAMP_KEY, STATUS_SUCCESS
if record[STATUS_KEY] == STATUS_SUCCESS:
    log_result(STATUS_SUCCESS, record[TIMESTAMP_KEY])
```

**Benefits:**
- Typos caught at import time, not runtime
- Rename in one place, not grep-and-replace
- IDE autocomplete works
- Clear documentation of valid values

### Pattern 9: Remove Legacy Compatibility Code

**Avoid adding code "just in case" for backward compatibility.**

```python
# BAD: Adding compat code that may never be needed
old_function_name = new_function_name  # backward compat
_legacy_var = current_var  # keep for old imports

# BAD: Re-exporting removed items
from .module import Thing
OldThing = Thing  # alias for backward compat

# BAD: Version checks for hypothetical old versions
if sys.version_info < (3, 8):
    # polyfill code that's never actually used

# GOOD: Just use the new code directly
# - Delete old aliases completely
# - Don't re-export removed items
# - Remove unused version checks
# - If something is removed, it's removed
```

**When to keep legacy code:**
- Published library with semantic versioning commitments
- Documented deprecation period not yet expired
- Known consumers still using the old API

**When to remove:**
- Internal code with no external consumers
- "Just in case" additions with no known users
- Deprecation period has passed
- Tests still pass without it

### Pattern 10: Remove Dead Code

**Delete code that is never executed.**

```python
# BAD: Keeping "just in case"
def old_algorithm(data):
    """Old implementation, keeping just in case."""
    pass  # Never called

class UnusedHelper:
    """Was going to use this but never did."""
    pass

import unused_module  # IDE shows it's grayed out

# GOOD: Delete it
# - If you need it later, git has history
# - Dead code creates confusion
# - It still needs to be maintained (imports, syntax)
```

**Safe to remove (high confidence):**
- Unused imports (ruff/eslint catch these)
- Unreachable code after return/throw
- Functions with zero callers across entire project
- Commented-out code blocks

**Verify before removing (medium confidence):**
- Functions that might be called dynamically
- Methods that might be called via reflection
- Exports that might be used by external packages

## When NOT to Refactor

Some complexity is justified. Skip refactoring when:

| Pattern | Example | Why Keep It |
|---------|---------|-------------|
| Standard algorithms | Topological sort, BFS/DFS | Well-known implementations |
| CLI display logic | Formatting tables, progress bars | Readability over metrics |
| Data aggregation | Multiple metrics in one pass | Performance - avoid multiple iterations |
| Error handling | Multiple catch blocks | Explicit handling is clearer |
| Configuration | Large switch/match statements | Self-documenting options |

**Rule of thumb**: If extracting would require passing 5+ parameters or the function name would be unclear, the complexity may be justified.

## Complexity Grades

| Grade | Score | Action |
|-------|-------|--------|
| A | 1-5 | No action needed |
| B | 6-10 | Acceptable, review if time permits |
| C | 11-20 | Consider refactoring |
| D-F | 21+ | Refactor required |

## Tools Reference

| Tool | Language | Purpose | Command |
|------|----------|---------|---------|
| ruff | Python | Linting + auto-fix | `ruff check . --fix` |
| ruff format | Python | Formatting | `ruff format .` |
| radon | Python | Complexity metrics | `radon cc . -a -s` |
| vulture | Python | Dead code detection | `vulture .` |
| eslint | TS/JS | Linting + auto-fix | `npx eslint . --fix` |
| prettier | TS/JS | Formatting | `npx prettier --write .` |
| tsc | TS | Type checking | `npx tsc --noEmit` |
| ts-prune | TS | Unused exports | `npx ts-prune` |
| jscpd | Both | Duplicate detection | Via `detect_clones.py` |
| detect_dead_code.py | Both | Dead code detection | `python3 ~/.claude/skills/code-quality/scripts/detect_dead_code.py .` |
| detect_legacy_compat.py | Both | Legacy code detection | `python3 ~/.claude/skills/code-quality/scripts/detect_legacy_compat.py .` |
| detect_similar_patterns.py | Python | Pattern detection | `python3 ~/.claude/skills/code-quality/scripts/detect_similar_patterns.py .` |
| **detect_ts_patterns.ts** | TS/React | JSX/hooks/props patterns | `npx tsx ~/.claude/skills/code-quality/scripts/detect_ts_patterns.ts .` |
| **analyze_with_lsp.ts** | Both | LSP semantic analysis | `npx tsx ~/.claude/skills/code-quality/scripts/analyze_with_lsp.ts .` |
| **analyze_codebase.py** | Both | Unified analysis runner | `python3 ~/.claude/skills/code-quality/scripts/analyze_codebase.py .` |
