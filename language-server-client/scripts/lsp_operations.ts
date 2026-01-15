#!/usr/bin/env tsx

/**
 * Common LSP Operations
 *
 * This module provides high-level operations and workflows for working with LSP clients.
 * These functions handle common tasks like analyzing a codebase, finding call hierarchies,
 * and performing batch operations.
 *
 * Usage:
 *   import { analyzeCodebase, findSymbolReferences, formatFiles } from './lsp_operations';
 *
 *   const analysis = await analyzeCodebase(client, '/path/to/project');
 *   const refs = await findSymbolReferences(client, 'file:///path/to/file.ts', { line: 10, character: 5 });
 */

import { LSPClient, Position, Location, Diagnostic } from './lsp_client';
import * as fs from 'fs';
import * as path from 'path';

export interface CodebaseAnalysis {
  totalFiles: number;
  diagnostics: Map<string, Diagnostic[]>;
  symbols: Map<string, any[]>;
  errorCount: number;
  warningCount: number;
}

export interface SymbolReference {
  symbol: string;
  definition: Location | Location[] | null;
  references: Location[];
  usageCount: number;
}

/**
 * Recursively find all files matching a pattern in a directory
 */
function findFiles(dir: string, pattern: RegExp, files: string[] = []): string[] {
  const entries = fs.readdirSync(dir, { withFileTypes: true });

  for (const entry of entries) {
    const fullPath = path.join(dir, entry.name);

    if (entry.isDirectory()) {
      // Skip common directories that should be ignored
      if (['node_modules', '.git', 'dist', 'build', '.next', 'coverage'].includes(entry.name)) {
        continue;
      }
      findFiles(fullPath, pattern, files);
    } else if (entry.isFile() && pattern.test(entry.name)) {
      files.push(fullPath);
    }
  }

  return files;
}

/**
 * Convert file path to file URI
 */
function pathToUri(filePath: string): string {
  const normalizedPath = path.resolve(filePath);
  return `file://${normalizedPath}`;
}

/**
 * Convert file URI to file path
 */
function uriToPath(uri: string): string {
  return uri.replace(/^file:\/\//, '');
}

/**
 * Analyze an entire codebase to gather diagnostics and symbols
 */
export async function analyzeCodebase(
  client: LSPClient,
  projectPath: string,
  filePattern: RegExp = /\.(ts|tsx|js|jsx)$/
): Promise<CodebaseAnalysis> {
  const files = findFiles(projectPath, filePattern);
  const analysis: CodebaseAnalysis = {
    totalFiles: files.length,
    diagnostics: new Map(),
    symbols: new Map(),
    errorCount: 0,
    warningCount: 0,
  };

  console.log(`[LSP] Analyzing ${files.length} files...`);

  for (const file of files) {
    const uri = pathToUri(file);
    const content = fs.readFileSync(file, 'utf-8');

    // Determine language ID from file extension
    const ext = path.extname(file);
    const languageId = ext === '.ts' || ext === '.tsx' ? 'typescript' : 'javascript';

    // Open document
    await client.openDocument(uri, languageId, 1, content);

    // Wait a bit for diagnostics to arrive
    await new Promise((resolve) => setTimeout(resolve, 100));

    // Get document symbols
    try {
      const symbols = await client.documentSymbols(uri);
      if (symbols) {
        analysis.symbols.set(uri, symbols);
      }
    } catch (error) {
      console.error(`[LSP] Error getting symbols for ${file}:`, error);
    }

    // Close document
    await client.closeDocument(uri);
  }

  // Listen for diagnostics
  client.on('notification', (method: string, params: any) => {
    if (method === 'textDocument/publishDiagnostics') {
      const diagnostics = params.diagnostics || [];
      analysis.diagnostics.set(params.uri, diagnostics);

      for (const diag of diagnostics) {
        if (diag.severity === 1) {
          analysis.errorCount++;
        } else if (diag.severity === 2) {
          analysis.warningCount++;
        }
      }
    }
  });

  return analysis;
}

/**
 * Find all references to a symbol at a given position
 */
export async function findSymbolReferences(
  client: LSPClient,
  uri: string,
  position: Position
): Promise<SymbolReference> {
  // Get definition
  const definition = await client.gotoDefinition(uri, position);

  // Get references
  const references = await client.findReferences(uri, position, true);

  // Get hover info to extract symbol name
  const hoverInfo = await client.hover(uri, position);
  const symbol = hoverInfo?.contents?.value || 'Unknown';

  return {
    symbol,
    definition,
    references,
    usageCount: references.length,
  };
}

/**
 * Get all diagnostics for a specific file
 */
export async function getFileDiagnostics(
  client: LSPClient,
  filePath: string,
  languageId: string = 'typescript'
): Promise<Diagnostic[]> {
  const uri = pathToUri(filePath);
  const content = fs.readFileSync(filePath, 'utf-8');

  // Open document
  await client.openDocument(uri, languageId, 1, content);

  // Wait for diagnostics
  const diagnostics = await new Promise<Diagnostic[]>((resolve) => {
    const timeout = setTimeout(() => {
      resolve([]);
    }, 2000);

    const handler = (method: string, params: any) => {
      if (method === 'textDocument/publishDiagnostics' && params.uri === uri) {
        clearTimeout(timeout);
        client.off('notification', handler);
        resolve(params.diagnostics || []);
      }
    };

    client.on('notification', handler);
  });

  // Close document
  await client.closeDocument(uri);

  return diagnostics;
}

/**
 * Format multiple files
 */
export async function formatFiles(
  client: LSPClient,
  files: string[],
  options: { tabSize: number; insertSpaces: boolean } = { tabSize: 2, insertSpaces: true }
): Promise<Map<string, any>> {
  const results = new Map();

  for (const file of files) {
    const uri = pathToUri(file);
    const content = fs.readFileSync(file, 'utf-8');
    const ext = path.extname(file);
    const languageId = ext === '.ts' || ext === '.tsx' ? 'typescript' : 'javascript';

    // Open document
    await client.openDocument(uri, languageId, 1, content);

    try {
      // Get formatting edits
      const edits = await client.format(uri, options);
      results.set(file, edits);
    } catch (error) {
      console.error(`[LSP] Error formatting ${file}:`, error);
      results.set(file, { error: error instanceof Error ? error.message : String(error) });
    }

    // Close document
    await client.closeDocument(uri);
  }

  return results;
}

/**
 * Rename a symbol across the codebase
 */
export async function renameSymbol(
  client: LSPClient,
  uri: string,
  position: Position,
  newName: string
): Promise<any> {
  const workspaceEdit = await client.rename(uri, position, newName);
  return workspaceEdit;
}

/**
 * Get code completion suggestions at a position
 */
export async function getCompletions(
  client: LSPClient,
  filePath: string,
  position: Position,
  languageId: string = 'typescript'
): Promise<any> {
  const uri = pathToUri(filePath);
  const content = fs.readFileSync(filePath, 'utf-8');

  // Open document
  await client.openDocument(uri, languageId, 1, content);

  // Get completions
  const completions = await client.completion(uri, position);

  // Close document
  await client.closeDocument(uri);

  return completions;
}

/**
 * Build a call graph starting from a specific symbol
 */
export async function buildCallGraph(
  client: LSPClient,
  uri: string,
  position: Position,
  maxDepth: number = 3
): Promise<any> {
  const visited = new Set<string>();
  const graph: any = {
    symbol: null,
    references: [],
    children: [],
  };

  async function traverse(currentUri: string, currentPos: Position, depth: number): Promise<any> {
    if (depth >= maxDepth) return null;

    const key = `${currentUri}:${currentPos.line}:${currentPos.character}`;
    if (visited.has(key)) return null;
    visited.add(key);

    // Get symbol info
    const hoverInfo = await client.hover(currentUri, currentPos);
    const references = await client.findReferences(currentUri, currentPos, false);

    const node: any = {
      symbol: hoverInfo?.contents?.value || 'Unknown',
      location: { uri: currentUri, position: currentPos },
      references: references.length,
      children: [],
    };

    // For each reference, find what it calls
    for (const ref of references.slice(0, 10)) {
      // Limit to avoid explosion
      const child = await traverse(ref.uri, ref.range.start, depth + 1);
      if (child) {
        node.children.push(child);
      }
    }

    return node;
  }

  graph.symbol = await traverse(uri, position, 0);
  return graph;
}

/**
 * Find all symbols of a specific kind in the workspace
 */
export async function findSymbolsByKind(
  client: LSPClient,
  projectPath: string,
  symbolKind: number, // 1=File, 2=Module, 5=Class, 6=Method, 12=Function, etc.
  filePattern: RegExp = /\.(ts|tsx|js|jsx)$/
): Promise<Map<string, any[]>> {
  const files = findFiles(projectPath, filePattern);
  const symbolsByFile = new Map();

  for (const file of files) {
    const uri = pathToUri(file);
    const content = fs.readFileSync(file, 'utf-8');
    const ext = path.extname(file);
    const languageId = ext === '.ts' || ext === '.tsx' ? 'typescript' : 'javascript';

    // Open document
    await client.openDocument(uri, languageId, 1, content);

    try {
      // Get document symbols
      const symbols = await client.documentSymbols(uri);

      if (symbols) {
        // Filter by kind
        const filtered = filterSymbolsByKind(symbols, symbolKind);
        if (filtered.length > 0) {
          symbolsByFile.set(file, filtered);
        }
      }
    } catch (error) {
      console.error(`[LSP] Error getting symbols for ${file}:`, error);
    }

    // Close document
    await client.closeDocument(uri);
  }

  return symbolsByFile;
}

function filterSymbolsByKind(symbols: any[], kind: number): any[] {
  const result: any[] = [];

  for (const symbol of symbols) {
    if (symbol.kind === kind) {
      result.push(symbol);
    }
    if (symbol.children) {
      result.push(...filterSymbolsByKind(symbol.children, kind));
    }
  }

  return result;
}
