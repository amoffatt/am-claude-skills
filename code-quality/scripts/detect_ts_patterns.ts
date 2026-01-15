#!/usr/bin/env tsx
/**
 * TypeScript/React Pattern Detection
 *
 * Detects code patterns that indicate refactoring opportunities:
 * - Similar JSX structures
 * - Repeated prop patterns
 * - Similar hooks usage patterns
 * - Magic strings
 * - Similar function implementations
 * - Import patterns (circular deps, heavy imports)
 *
 * Usage:
 *   npx tsx detect_ts_patterns.ts <project-path> [--json]
 *
 * Requirements:
 *   npm install typescript
 */

import * as ts from 'typescript';
import * as fs from 'fs';
import * as path from 'path';

// ============================================================================
// Types
// ============================================================================

interface PatternLocation {
  file: string;
  line: number;
  code?: string;
}

interface SimilarPattern {
  pattern: string;
  count: number;
  locations: PatternLocation[];
}

interface ImportInfo {
  from: string;
  to: string;
  importedSymbols: string[];
  isTypeOnly: boolean;
}

interface AnalysisResult {
  root: string;
  filesAnalyzed: number;
  magicStrings: Array<{
    string: string;
    count: number;
    suggestedName: string;
    locations: PatternLocation[];
  }>;
  similarJsxPatterns: SimilarPattern[];
  similarPropPatterns: SimilarPattern[];
  similarHooksPatterns: SimilarPattern[];
  similarFunctionBodies: Array<{
    similarity: number;
    func1: { name: string; file: string; line: number };
    func2: { name: string; file: string; line: number };
    bodyHash: string;
  }>;
  importGraph: {
    circular: string[][];
    unusedExports: Array<{ symbol: string; file: string; line: number }>;
    heavyImports: Array<{ file: string; from: string; count: number }>;
  };
  refactoringCandidates: Array<{
    type: string;
    reason: string;
    suggestion: string;
    locations?: PatternLocation[];
  }>;
}

// ============================================================================
// File Discovery
// ============================================================================

const EXCLUDE_DIRS = [
  'node_modules', '.git', 'dist', 'build', '.next', 'coverage',
  '__pycache__', '.venv', 'venv', '.tox', 'out'
];

function findTsFiles(root: string, files: string[] = []): string[] {
  try {
    const entries = fs.readdirSync(root, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(root, entry.name);
      if (entry.isDirectory()) {
        if (!EXCLUDE_DIRS.includes(entry.name)) {
          findTsFiles(fullPath, files);
        }
      } else if (entry.isFile() && /\.(tsx?|jsx?)$/.test(entry.name)) {
        files.push(fullPath);
      }
    }
  } catch {}
  return files;
}

// ============================================================================
// AST Utilities
// ============================================================================

function getNodeText(node: ts.Node, sourceFile: ts.SourceFile): string {
  return node.getText(sourceFile);
}

function getLineNumber(node: ts.Node, sourceFile: ts.SourceFile): number {
  return sourceFile.getLineAndCharacterOfPosition(node.getStart(sourceFile)).line + 1;
}

function normalizeCode(code: string): string {
  return code
    .replace(/\s+/g, ' ')              // Normalize whitespace
    .replace(/['"`][^'"`]*['"`]/g, '"STR"') // Normalize strings
    .replace(/\b\d+\.?\d*\b/g, 'NUM')  // Normalize numbers
    .replace(/\b[a-z_][a-z0-9_]*\s*=/gi, 'VAR =') // Normalize variable names
    .trim();
}

function hashFunctionBody(node: ts.FunctionLikeDeclaration, sourceFile: ts.SourceFile): string {
  if (!node.body) return '';
  const text = getNodeText(node.body, sourceFile);
  return normalizeCode(text);
}

function suggestConstantName(s: string): string {
  let name = s.toUpperCase()
    .replace(/[^A-Z0-9]+/g, '_')
    .replace(/^_|_$/g, '');
  if (name.length > 30) {
    name = name.substring(0, 30).replace(/_[^_]*$/, '');
  }
  return name || 'STRING_CONSTANT';
}

// ============================================================================
// Pattern Extractors
// ============================================================================

function extractJsxPattern(node: ts.JsxElement | ts.JsxSelfClosingElement, sourceFile: ts.SourceFile): string {
  const parts: string[] = [];

  function visit(n: ts.Node, depth: number = 0): void {
    if (ts.isJsxElement(n)) {
      const tagName = n.openingElement.tagName.getText(sourceFile);
      const attrCount = n.openingElement.attributes.properties.length;
      parts.push(`${'  '.repeat(depth)}<${tagName} attrs=${attrCount}>`);
      n.children.forEach(child => visit(child, depth + 1));
      parts.push(`${'  '.repeat(depth)}</${tagName}>`);
    } else if (ts.isJsxSelfClosingElement(n)) {
      const tagName = n.tagName.getText(sourceFile);
      const attrCount = n.attributes.properties.length;
      parts.push(`${'  '.repeat(depth)}<${tagName} attrs=${attrCount} />`);
    } else if (ts.isJsxFragment(n)) {
      parts.push(`${'  '.repeat(depth)}<Fragment>`);
      n.children.forEach(child => visit(child, depth + 1));
      parts.push(`${'  '.repeat(depth)}</Fragment>`);
    } else if (ts.isJsxExpression(n)) {
      parts.push(`${'  '.repeat(depth)}{expr}`);
    } else if (ts.isJsxText(n)) {
      const text = n.getText(sourceFile).trim();
      if (text) {
        parts.push(`${'  '.repeat(depth)}[text]`);
      }
    }
  }

  visit(node);
  return parts.join('\n');
}

function extractPropPattern(attrs: ts.JsxAttributes, sourceFile: ts.SourceFile): string {
  const propNames: string[] = [];

  for (const prop of attrs.properties) {
    if (ts.isJsxAttribute(prop)) {
      propNames.push(prop.name.getText(sourceFile));
    } else if (ts.isJsxSpreadAttribute(prop)) {
      propNames.push('...spread');
    }
  }

  return propNames.sort().join(', ');
}

function extractHookPattern(node: ts.CallExpression, sourceFile: ts.SourceFile): string | null {
  const callee = node.expression.getText(sourceFile);

  // Match React hooks
  if (/^use[A-Z]/.test(callee)) {
    const argTypes = node.arguments.map(arg => {
      if (ts.isArrowFunction(arg) || ts.isFunctionExpression(arg)) {
        return 'callback';
      } else if (ts.isArrayLiteralExpression(arg)) {
        return `array[${arg.elements.length}]`;
      } else if (ts.isObjectLiteralExpression(arg)) {
        return `object{${arg.properties.length}}`;
      } else if (ts.isStringLiteral(arg)) {
        return 'string';
      } else if (ts.isNumericLiteral(arg)) {
        return 'number';
      }
      return 'expr';
    });

    return `${callee}(${argTypes.join(', ')})`;
  }

  return null;
}

// ============================================================================
// Import Graph Analysis
// ============================================================================

function buildImportGraph(files: string[], root: string): Map<string, ImportInfo[]> {
  const graph = new Map<string, ImportInfo[]>();

  for (const file of files) {
    const relativePath = path.relative(root, file);
    const content = fs.readFileSync(file, 'utf-8');
    const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);

    const imports: ImportInfo[] = [];

    ts.forEachChild(sourceFile, node => {
      if (ts.isImportDeclaration(node)) {
        const moduleSpecifier = node.moduleSpecifier;
        if (ts.isStringLiteral(moduleSpecifier)) {
          const importPath = moduleSpecifier.text;

          // Resolve relative imports
          let resolvedPath = importPath;
          if (importPath.startsWith('.')) {
            const dir = path.dirname(file);
            resolvedPath = path.relative(root, path.resolve(dir, importPath));
            // Normalize to match our file paths
            if (!resolvedPath.match(/\.(tsx?|jsx?)$/)) {
              // Try to find the actual file
              for (const ext of ['.ts', '.tsx', '.js', '.jsx', '/index.ts', '/index.tsx']) {
                const tryPath = path.join(root, resolvedPath + ext);
                if (fs.existsSync(tryPath)) {
                  resolvedPath = path.relative(root, tryPath);
                  break;
                }
              }
            }
          }

          const importedSymbols: string[] = [];
          const isTypeOnly = node.importClause?.isTypeOnly || false;

          if (node.importClause) {
            if (node.importClause.name) {
              importedSymbols.push(node.importClause.name.text);
            }
            if (node.importClause.namedBindings) {
              if (ts.isNamedImports(node.importClause.namedBindings)) {
                for (const element of node.importClause.namedBindings.elements) {
                  importedSymbols.push(element.name.text);
                }
              } else if (ts.isNamespaceImport(node.importClause.namedBindings)) {
                importedSymbols.push('* as ' + node.importClause.namedBindings.name.text);
              }
            }
          }

          imports.push({
            from: relativePath,
            to: resolvedPath,
            importedSymbols,
            isTypeOnly,
          });
        }
      }
    });

    graph.set(relativePath, imports);
  }

  return graph;
}

function findCircularDependencies(graph: Map<string, ImportInfo[]>): string[][] {
  const cycles: string[][] = [];
  const visited = new Set<string>();
  const recursionStack = new Set<string>();
  const path: string[] = [];

  function dfs(node: string): void {
    visited.add(node);
    recursionStack.add(node);
    path.push(node);

    const imports = graph.get(node) || [];
    for (const imp of imports) {
      // Only check internal imports (not node_modules)
      if (!imp.to.startsWith('.') && !graph.has(imp.to)) continue;

      const target = graph.has(imp.to) ? imp.to : null;
      if (!target) continue;

      if (!visited.has(target)) {
        dfs(target);
      } else if (recursionStack.has(target)) {
        // Found cycle
        const cycleStart = path.indexOf(target);
        if (cycleStart !== -1) {
          cycles.push([...path.slice(cycleStart), target]);
        }
      }
    }

    path.pop();
    recursionStack.delete(node);
  }

  for (const file of graph.keys()) {
    if (!visited.has(file)) {
      dfs(file);
    }
  }

  // Deduplicate cycles
  const uniqueCycles = new Map<string, string[]>();
  for (const cycle of cycles) {
    const key = [...cycle].sort().join('|');
    if (!uniqueCycles.has(key)) {
      uniqueCycles.set(key, cycle);
    }
  }

  return Array.from(uniqueCycles.values());
}

function findHeavyImports(graph: Map<string, ImportInfo[]>): Array<{ file: string; from: string; count: number }> {
  const importCounts = new Map<string, Map<string, number>>();

  for (const [file, imports] of graph) {
    for (const imp of imports) {
      if (!imp.to.startsWith('.') && !imp.to.startsWith('/')) {
        // External package
        const pkg = imp.to.split('/')[0];
        if (!importCounts.has(file)) {
          importCounts.set(file, new Map());
        }
        const current = importCounts.get(file)!.get(pkg) || 0;
        importCounts.get(file)!.set(pkg, current + imp.importedSymbols.length);
      }
    }
  }

  const heavy: Array<{ file: string; from: string; count: number }> = [];
  for (const [file, packages] of importCounts) {
    for (const [pkg, count] of packages) {
      if (count >= 5) {
        heavy.push({ file, from: pkg, count });
      }
    }
  }

  return heavy.sort((a, b) => b.count - a.count);
}

// ============================================================================
// Main Analysis
// ============================================================================

function analyzeFile(
  file: string,
  root: string,
  result: AnalysisResult
): void {
  const content = fs.readFileSync(file, 'utf-8');
  const sourceFile = ts.createSourceFile(file, content, ts.ScriptTarget.Latest, true);
  const relativePath = path.relative(root, file);

  const stringLiterals = new Map<string, PatternLocation[]>();
  const jsxPatterns = new Map<string, PatternLocation[]>();
  const propPatterns = new Map<string, PatternLocation[]>();
  const hookPatterns = new Map<string, PatternLocation[]>();
  const functionBodies = new Map<string, { name: string; file: string; line: number }[]>();

  function visit(node: ts.Node): void {
    // Magic strings
    if (ts.isStringLiteral(node)) {
      const value = node.text;
      if (value.length >= 4 && value.length <= 100 && !/^\s*$/.test(value)) {
        // Skip common patterns
        if (!value.startsWith('http') && !value.endsWith('.js') && !value.endsWith('.ts')) {
          const locations = stringLiterals.get(value) || [];
          locations.push({
            file: relativePath,
            line: getLineNumber(node, sourceFile),
          });
          stringLiterals.set(value, locations);
        }
      }
    }

    // JSX patterns
    if (ts.isJsxElement(node) || ts.isJsxSelfClosingElement(node)) {
      const pattern = extractJsxPattern(node, sourceFile);
      // Only track significant JSX (3+ elements or nested structure)
      if (pattern.split('\n').length >= 3) {
        const locations = jsxPatterns.get(pattern) || [];
        locations.push({
          file: relativePath,
          line: getLineNumber(node, sourceFile),
          code: getNodeText(node, sourceFile).substring(0, 100),
        });
        jsxPatterns.set(pattern, locations);
      }

      // Props patterns
      const attrs = ts.isJsxElement(node)
        ? node.openingElement.attributes
        : node.attributes;
      if (attrs.properties.length >= 3) {
        const propPattern = extractPropPattern(attrs, sourceFile);
        const locations = propPatterns.get(propPattern) || [];
        locations.push({
          file: relativePath,
          line: getLineNumber(node, sourceFile),
        });
        propPatterns.set(propPattern, locations);
      }
    }

    // Hooks patterns
    if (ts.isCallExpression(node)) {
      const hookPattern = extractHookPattern(node, sourceFile);
      if (hookPattern) {
        const locations = hookPatterns.get(hookPattern) || [];
        locations.push({
          file: relativePath,
          line: getLineNumber(node, sourceFile),
        });
        hookPatterns.set(hookPattern, locations);
      }
    }

    // Function bodies (for similarity detection)
    if (ts.isFunctionDeclaration(node) || ts.isArrowFunction(node) || ts.isMethodDeclaration(node)) {
      const bodyHash = hashFunctionBody(node, sourceFile);
      if (bodyHash.length >= 50) { // Only track significant functions
        let name = 'anonymous';
        if (ts.isFunctionDeclaration(node) && node.name) {
          name = node.name.text;
        } else if (ts.isMethodDeclaration(node) && ts.isIdentifier(node.name)) {
          name = node.name.text;
        } else if (ts.isArrowFunction(node)) {
          // Try to get name from variable declaration
          if (ts.isVariableDeclaration(node.parent) && ts.isIdentifier(node.parent.name)) {
            name = node.parent.name.text;
          }
        }

        const entries = functionBodies.get(bodyHash) || [];
        entries.push({
          name,
          file: relativePath,
          line: getLineNumber(node, sourceFile),
        });
        functionBodies.set(bodyHash, entries);
      }
    }

    ts.forEachChild(node, visit);
  }

  visit(sourceFile);

  // Accumulate results
  for (const [value, locations] of stringLiterals) {
    if (locations.length >= 3) {
      const existing = result.magicStrings.find(m => m.string === value);
      if (existing) {
        existing.count += locations.length;
        existing.locations.push(...locations);
      } else {
        result.magicStrings.push({
          string: value,
          count: locations.length,
          suggestedName: suggestConstantName(value),
          locations,
        });
      }
    }
  }

  for (const [pattern, locations] of jsxPatterns) {
    if (locations.length >= 2) {
      const existing = result.similarJsxPatterns.find(p => p.pattern === pattern);
      if (existing) {
        existing.count += locations.length;
        existing.locations.push(...locations);
      } else {
        result.similarJsxPatterns.push({ pattern, count: locations.length, locations });
      }
    }
  }

  for (const [pattern, locations] of propPatterns) {
    if (locations.length >= 2) {
      const existing = result.similarPropPatterns.find(p => p.pattern === pattern);
      if (existing) {
        existing.count += locations.length;
        existing.locations.push(...locations);
      } else {
        result.similarPropPatterns.push({ pattern, count: locations.length, locations });
      }
    }
  }

  for (const [pattern, locations] of hookPatterns) {
    if (locations.length >= 2) {
      const existing = result.similarHooksPatterns.find(p => p.pattern === pattern);
      if (existing) {
        existing.count += locations.length;
        existing.locations.push(...locations);
      } else {
        result.similarHooksPatterns.push({ pattern, count: locations.length, locations });
      }
    }
  }

  for (const [bodyHash, entries] of functionBodies) {
    if (entries.length >= 2) {
      // Add pairwise comparisons
      for (let i = 0; i < entries.length; i++) {
        for (let j = i + 1; j < entries.length; j++) {
          result.similarFunctionBodies.push({
            similarity: 100,
            func1: entries[i],
            func2: entries[j],
            bodyHash: bodyHash.substring(0, 50),
          });
        }
      }
    }
  }
}

async function main(): Promise<void> {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
TypeScript/React Pattern Detection

Usage:
  npx tsx detect_ts_patterns.ts <project-path> [--json]

Detects:
  - Magic strings (repeated string literals)
  - Similar JSX structures
  - Repeated prop patterns
  - Similar hooks usage
  - Similar function implementations
  - Circular dependencies
  - Heavy imports

Requirements:
  npm install typescript
`);
    process.exit(0);
  }

  const root = path.resolve(args[0]);
  const jsonOutput = args.includes('--json');

  if (!fs.existsSync(root)) {
    console.error(`Error: Path not found: ${root}`);
    process.exit(1);
  }

  const files = findTsFiles(root);

  if (files.length === 0) {
    console.error('No TypeScript/JavaScript files found');
    process.exit(0);
  }

  const result: AnalysisResult = {
    root,
    filesAnalyzed: files.length,
    magicStrings: [],
    similarJsxPatterns: [],
    similarPropPatterns: [],
    similarHooksPatterns: [],
    similarFunctionBodies: [],
    importGraph: {
      circular: [],
      unusedExports: [],
      heavyImports: [],
    },
    refactoringCandidates: [],
  };

  // Analyze each file
  console.error(`[TS] Analyzing ${files.length} files...`);
  for (const file of files) {
    try {
      analyzeFile(file, root, result);
    } catch (e) {
      // Skip files with parse errors
    }
  }

  // Import graph analysis
  console.error('[TS] Building import graph...');
  const importGraph = buildImportGraph(files, root);
  result.importGraph.circular = findCircularDependencies(importGraph);
  result.importGraph.heavyImports = findHeavyImports(importGraph);

  // Sort results by count
  result.magicStrings.sort((a, b) => b.count - a.count);
  result.similarJsxPatterns.sort((a, b) => b.count - a.count);
  result.similarPropPatterns.sort((a, b) => b.count - a.count);
  result.similarHooksPatterns.sort((a, b) => b.count - a.count);

  // Generate refactoring candidates
  for (const magic of result.magicStrings.slice(0, 5)) {
    result.refactoringCandidates.push({
      type: 'extract_constant',
      reason: `String "${magic.string.substring(0, 30)}..." repeated ${magic.count} times`,
      suggestion: `Create constant: const ${magic.suggestedName} = "${magic.string}"`,
      locations: magic.locations.slice(0, 3),
    });
  }

  for (const jsx of result.similarJsxPatterns.slice(0, 3)) {
    result.refactoringCandidates.push({
      type: 'extract_component',
      reason: `Similar JSX structure repeated ${jsx.count} times`,
      suggestion: 'Extract to reusable component with props for variations',
      locations: jsx.locations.slice(0, 3),
    });
  }

  for (const props of result.similarPropPatterns.slice(0, 3)) {
    if (props.pattern.split(',').length >= 4) {
      result.refactoringCandidates.push({
        type: 'extract_props_interface',
        reason: `Prop pattern "${props.pattern.substring(0, 40)}..." repeated ${props.count} times`,
        suggestion: 'Create shared props interface or spread object',
        locations: props.locations.slice(0, 3),
      });
    }
  }

  for (const cycle of result.importGraph.circular.slice(0, 3)) {
    result.refactoringCandidates.push({
      type: 'break_circular_dependency',
      reason: `Circular dependency: ${cycle.join(' -> ')}`,
      suggestion: 'Extract shared code to a separate module or refactor imports',
    });
  }

  for (const func of result.similarFunctionBodies.slice(0, 3)) {
    result.refactoringCandidates.push({
      type: 'consolidate_functions',
      reason: `${func.func1.name} and ${func.func2.name} have identical implementations`,
      suggestion: 'Consolidate into single function or extract shared logic',
      locations: [
        { file: func.func1.file, line: func.func1.line },
        { file: func.func2.file, line: func.func2.line },
      ],
    });
  }

  // Output
  if (jsonOutput) {
    console.log(JSON.stringify(result, null, 2));
  } else {
    console.log('\n=== TypeScript/React Pattern Analysis ===\n');
    console.log(`Files analyzed: ${result.filesAnalyzed}`);

    if (result.magicStrings.length > 0) {
      console.log(`\n--- Magic Strings (${result.magicStrings.length}) ---`);
      for (const m of result.magicStrings.slice(0, 10)) {
        console.log(`  "${m.string.substring(0, 40)}${m.string.length > 40 ? '...' : ''}" (${m.count}x)`);
        console.log(`    Suggested: ${m.suggestedName}`);
      }
    }

    if (result.similarJsxPatterns.length > 0) {
      console.log(`\n--- Similar JSX Patterns (${result.similarJsxPatterns.length}) ---`);
      for (const p of result.similarJsxPatterns.slice(0, 5)) {
        console.log(`  Pattern (${p.count}x):`);
        const lines = p.pattern.split('\n').slice(0, 4);
        for (const line of lines) {
          console.log(`    ${line}`);
        }
        if (p.pattern.split('\n').length > 4) {
          console.log('    ...');
        }
        console.log(`    Locations: ${p.locations.map(l => `${l.file}:${l.line}`).slice(0, 3).join(', ')}`);
      }
    }

    if (result.similarPropPatterns.length > 0) {
      console.log(`\n--- Similar Prop Patterns (${result.similarPropPatterns.length}) ---`);
      for (const p of result.similarPropPatterns.slice(0, 5)) {
        console.log(`  Props: ${p.pattern.substring(0, 60)}${p.pattern.length > 60 ? '...' : ''} (${p.count}x)`);
      }
    }

    if (result.similarHooksPatterns.length > 0) {
      console.log(`\n--- Similar Hooks Patterns (${result.similarHooksPatterns.length}) ---`);
      for (const p of result.similarHooksPatterns.slice(0, 10)) {
        console.log(`  ${p.pattern} (${p.count}x)`);
      }
    }

    if (result.similarFunctionBodies.length > 0) {
      console.log(`\n--- Similar Function Bodies (${result.similarFunctionBodies.length}) ---`);
      for (const f of result.similarFunctionBodies.slice(0, 5)) {
        console.log(`  ${f.func1.name} (${f.func1.file}:${f.func1.line})`);
        console.log(`  ${f.func2.name} (${f.func2.file}:${f.func2.line})`);
        console.log('');
      }
    }

    if (result.importGraph.circular.length > 0) {
      console.log(`\n--- Circular Dependencies (${result.importGraph.circular.length}) ---`);
      for (const cycle of result.importGraph.circular.slice(0, 5)) {
        console.log(`  ${cycle.join(' -> ')}`);
      }
    }

    if (result.importGraph.heavyImports.length > 0) {
      console.log(`\n--- Heavy Imports (${result.importGraph.heavyImports.length}) ---`);
      for (const imp of result.importGraph.heavyImports.slice(0, 10)) {
        console.log(`  ${imp.file}: ${imp.count} symbols from ${imp.from}`);
      }
    }

    if (result.refactoringCandidates.length > 0) {
      console.log('\n--- Refactoring Candidates ---');
      for (const r of result.refactoringCandidates) {
        console.log(`\n  [${r.type}]`);
        console.log(`  Reason: ${r.reason}`);
        console.log(`  Suggestion: ${r.suggestion}`);
        if (r.locations) {
          console.log(`  Locations: ${r.locations.map(l => `${l.file}:${l.line}`).join(', ')}`);
        }
      }
    }

    const total = result.magicStrings.length + result.similarJsxPatterns.length +
                  result.similarFunctionBodies.length + result.importGraph.circular.length;
    console.log(`\n--- Summary ---`);
    console.log(`Found ${total} potential improvement areas.`);
  }
}

main().catch(console.error);
