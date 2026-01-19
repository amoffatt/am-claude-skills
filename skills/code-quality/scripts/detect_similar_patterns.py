#!/usr/bin/env python3
"""
Detect similar code patterns that should be refactored.

Finds:
- Repeated method chains (e.g., df.filter().sort().groupby())
- Similar function call sequences
- Repeated attribute access patterns
- Near-duplicate lines with minor variations
"""

import ast
import json
import sys
import os
from pathlib import Path
from collections import defaultdict
from difflib import SequenceMatcher

# Add parent directory to path for shared lib imports
sys.path.insert(0, str(Path(__file__).parent.parent))
from lib import find_python_files
from typing import Iterator


def iter_ast_nodes(files: list[str]) -> Iterator[tuple[str, ast.AST]]:
    """Iterate over all AST nodes in the given files, yielding (filepath, node) pairs."""
    for filepath in files:
        try:
            with open(filepath, 'r') as f:
                source = f.read()
            tree = ast.parse(source)
        except Exception:
            continue
        for node in ast.walk(tree):
            yield filepath, node


def get_call_chain(node: ast.expr) -> list[str]:
    """Extract method/attribute chain from an AST node."""
    chain = []
    current = node

    while True:
        if isinstance(current, ast.Call):
            if isinstance(current.func, ast.Attribute):
                chain.append(f".{current.func.attr}()")
                current = current.func.value
            elif isinstance(current.func, ast.Name):
                chain.append(f"{current.func.id}()")
                break
            else:
                break
        elif isinstance(current, ast.Attribute):
            chain.append(f".{current.attr}")
            current = current.value
        elif isinstance(current, ast.Name):
            chain.append(current.id)
            break
        elif isinstance(current, ast.Subscript):
            chain.append("[...]")
            current = current.value
        else:
            break

    chain.reverse()
    return chain


def normalize_line(line: str) -> str:
    """Normalize a line for comparison (remove variable names, literals)."""
    # Simple normalization - remove string literals and numbers
    import re
    normalized = re.sub(r'"[^"]*"', '"STR"', line)
    normalized = re.sub(r"'[^']*'", "'STR'", normalized)
    normalized = re.sub(r'\b\d+\b', 'NUM', normalized)
    normalized = re.sub(r'\b[a-z_][a-z0-9_]*\s*=', 'VAR =', normalized)
    return normalized.strip()


def find_similar_lines(files: list[str], min_similarity: float = 0.8) -> list[dict]:
    """Find lines that are similar but not identical."""
    all_lines = []  # (file, lineno, original, normalized)

    for filepath in files:
        try:
            with open(filepath, 'r') as f:
                for lineno, line in enumerate(f, 1):
                    stripped = line.strip()
                    # Skip short lines, comments, imports, blank lines
                    if (len(stripped) < 30 or
                        stripped.startswith('#') or
                        stripped.startswith('import ') or
                        stripped.startswith('from ') or
                        not stripped):
                        continue
                    normalized = normalize_line(stripped)
                    if len(normalized) >= 25:
                        all_lines.append((filepath, lineno, stripped, normalized))
        except Exception:
            continue

    # Group by normalized form
    groups = defaultdict(list)
    for filepath, lineno, original, normalized in all_lines:
        groups[normalized].append({
            "file": filepath,
            "line": lineno,
            "code": original
        })

    # Find groups with multiple occurrences
    similar_patterns = []
    for normalized, locations in groups.items():
        if len(locations) >= 2:
            # Check they're not all identical
            codes = set(loc["code"] for loc in locations)
            similar_patterns.append({
                "pattern": normalized,
                "count": len(locations),
                "is_exact_duplicate": len(codes) == 1,
                "locations": locations[:10]  # Limit locations shown
            })

    # Sort by count
    similar_patterns.sort(key=lambda x: x["count"], reverse=True)
    return similar_patterns[:30]


def find_method_chains(files: list[str], min_chain_length: int = 3) -> list[dict]:
    """Find repeated method call chains."""
    chains = defaultdict(list)

    for filepath, node in iter_ast_nodes(files):
        if isinstance(node, ast.Call):
            chain = get_call_chain(node)
            if len(chain) >= min_chain_length:
                chain_str = "".join(chain)
                chains[chain_str].append({
                    "file": filepath,
                    "line": getattr(node, 'lineno', 0)
                })

    # Find repeated chains
    repeated_chains = []
    for chain_str, locations in chains.items():
        if len(locations) >= 2:
            repeated_chains.append({
                "chain": chain_str,
                "count": len(locations),
                "locations": locations[:10]
            })

    repeated_chains.sort(key=lambda x: (x["count"], len(x["chain"])), reverse=True)
    return repeated_chains[:20]


def find_magic_strings(files: list[str], min_occurrences: int = 3, min_length: int = 4) -> list[dict]:
    """
    Find repeated string literals that should be constants.

    Detects "magic strings" - hardcoded strings used multiple times
    that should be extracted to named constants.
    """
    # Strings to ignore (common, intentional literals)
    IGNORE_STRINGS = {
        "", " ", ",", ".", ":", ";", "-", "_", "/", "\\", "\n", "\t",
        "utf-8", "utf8", "ascii", "r", "w", "rb", "wb", "a", "r+",
        "true", "false", "null", "none", "yes", "no",
        "id", "name", "type", "value", "key", "data", "result", "error",
        "get", "post", "put", "delete", "patch",
        "info", "debug", "warning", "error", "critical",
        "%s", "%d", "%f", "{}",
    }

    strings: dict[str, list[dict]] = defaultdict(list)

    for filepath, node in iter_ast_nodes(files):
        if isinstance(node, ast.Constant) and isinstance(node.value, str):
            s = node.value
            # Skip short strings, whitespace-only, and common patterns
            if (len(s) >= min_length and
                s.strip() and
                s.lower() not in IGNORE_STRINGS and
                not s.startswith('__') and  # dunder attributes
                not s.startswith('http') and  # URLs are often intentional
                not s.endswith('.py') and  # file paths
                not s.endswith('.json')):
                strings[s].append({
                    "file": filepath,
                    "line": getattr(node, 'lineno', 0)
                })

    # Find strings that appear multiple times
    magic_strings = []
    for string_val, locations in strings.items():
        if len(locations) >= min_occurrences:
            # Check if it appears in multiple files (stronger signal)
            unique_files = set(loc["file"] for loc in locations)
            magic_strings.append({
                "string": string_val[:100] + "..." if len(string_val) > 100 else string_val,
                "count": len(locations),
                "files": len(unique_files),
                "suggested_name": _suggest_constant_name(string_val),
                "locations": locations[:10]
            })

    # Sort by count * files (prioritize strings in multiple files)
    magic_strings.sort(key=lambda x: (x["files"], x["count"]), reverse=True)
    return magic_strings[:20]


def _suggest_constant_name(s: str) -> str:
    """Generate a suggested constant name for a string."""
    import re
    # Clean up the string
    name = s.upper()
    # Replace non-alphanumeric with underscore
    name = re.sub(r'[^A-Z0-9]+', '_', name)
    # Remove leading/trailing underscores
    name = name.strip('_')
    # Truncate if too long
    if len(name) > 30:
        name = name[:30].rsplit('_', 1)[0]
    return name or "STRING_CONSTANT"


def find_similar_blocks(files: list[str], min_lines: int = 3, similarity_threshold: float = 0.75) -> list[dict]:
    """Find blocks of code that are similar but not identical."""
    blocks = []  # (file, start_line, lines_text)

    for filepath in files:
        try:
            with open(filepath, 'r') as f:
                lines = f.readlines()
        except Exception:
            continue

        # Extract blocks (consecutive non-blank lines)
        current_block = []
        block_start = 0

        for i, line in enumerate(lines):
            stripped = line.strip()
            if stripped and not stripped.startswith('#'):
                if not current_block:
                    block_start = i + 1
                current_block.append(stripped)
            else:
                if len(current_block) >= min_lines:
                    blocks.append((filepath, block_start, current_block.copy()))
                current_block = []

        if len(current_block) >= min_lines:
            blocks.append((filepath, block_start, current_block.copy()))

    # Compare blocks for similarity
    similar_blocks = []
    seen_pairs = set()

    for i, (file1, start1, lines1) in enumerate(blocks):
        text1 = "\n".join(lines1)
        for j, (file2, start2, lines2) in enumerate(blocks[i+1:], i+1):
            if (i, j) in seen_pairs:
                continue

            text2 = "\n".join(lines2)
            similarity = SequenceMatcher(None, text1, text2).ratio()

            if similarity_threshold <= similarity < 1.0:  # Similar but not identical
                similar_blocks.append({
                    "similarity": round(similarity, 2),
                    "block1": {
                        "file": file1,
                        "start_line": start1,
                        "preview": lines1[0][:80] + "..." if len(lines1[0]) > 80 else lines1[0],
                        "lines": len(lines1)
                    },
                    "block2": {
                        "file": file2,
                        "start_line": start2,
                        "preview": lines2[0][:80] + "..." if len(lines2[0]) > 80 else lines2[0],
                        "lines": len(lines2)
                    }
                })
                seen_pairs.add((i, j))

    similar_blocks.sort(key=lambda x: x["similarity"], reverse=True)
    return similar_blocks[:15]


def main():
    root = sys.argv[1] if len(sys.argv) > 1 else "."
    root = os.path.abspath(root)

    files = find_python_files(root)
    if not files:
        print(json.dumps({"error": "No Python files found", "root": root}))
        sys.exit(0)

    results = {
        "root": root,
        "files_analyzed": len(files),
        "similar_lines": [],
        "method_chains": [],
        "similar_blocks": [],
        "magic_strings": [],
        "refactoring_suggestions": []
    }

    # Find similar lines
    similar_lines = find_similar_lines(files)
    results["similar_lines"] = [p for p in similar_lines if not p["is_exact_duplicate"]][:15]

    # Find repeated method chains
    results["method_chains"] = find_method_chains(files)

    # Find similar blocks
    results["similar_blocks"] = find_similar_blocks(files)

    # Find magic strings (repeated literals that should be constants)
    results["magic_strings"] = find_magic_strings(files)

    # Generate refactoring suggestions
    suggestions = []

    for pattern in results["similar_lines"][:5]:
        if pattern["count"] >= 3:
            suggestions.append({
                "type": "extract_function",
                "reason": f"Line pattern repeated {pattern['count']} times",
                "pattern": pattern["pattern"][:100],
                "locations": len(pattern["locations"])
            })

    for chain in results["method_chains"][:5]:
        if chain["count"] >= 2 and len(chain["chain"]) > 20:
            suggestions.append({
                "type": "extract_method_chain",
                "reason": f"Method chain repeated {chain['count']} times",
                "chain": chain["chain"],
                "suggestion": "Create a helper function wrapping this chain"
            })

    for block in results["similar_blocks"][:5]:
        suggestions.append({
            "type": "consolidate_similar_blocks",
            "reason": f"Blocks are {int(block['similarity']*100)}% similar",
            "suggestion": "Extract common logic, parameterize differences"
        })

    for magic in results["magic_strings"][:5]:
        if magic["files"] > 1:  # Prioritize strings in multiple files
            suggestions.append({
                "type": "extract_constant",
                "reason": f"String '{magic['string'][:30]}...' appears {magic['count']} times in {magic['files']} files",
                "suggested_name": magic["suggested_name"],
                "suggestion": f"Create constant: {magic['suggested_name']} = \"{magic['string'][:50]}...\""
            })

    results["refactoring_suggestions"] = suggestions

    print(json.dumps(results, indent=2))


if __name__ == "__main__":
    main()
