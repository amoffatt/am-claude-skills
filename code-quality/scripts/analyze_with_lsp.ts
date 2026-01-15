#!/usr/bin/env tsx

/**
 * LSP-Based Code Quality Analysis
 *
 * Uses Language Server Protocol for accurate code analysis that text-based tools miss.
 * Leverages the language server's semantic understanding of the codebase.
 *
 * Usage:
 *   npx tsx analyze_with_lsp.ts <project-path> [options]
 *
 * Options:
 *   --language <ts|py>       Force language (auto-detected by default)
 *   --output <json|text>     Output format (default: text)
 *   --analysis <type>        Run specific analysis (default: all)
 *
 * Analysis types:
 *   unused          - Find unused symbols (0 references)
 *   signatures      - Find functions with identical signatures (consolidation candidates)
 *   cooccurrence    - Find symbols always used together (extract to module)
 *   dead-params     - Find function parameters never used
 *   hotspots        - Find over-referenced symbols (abstraction candidates)
 *   similar-types   - Find types/interfaces with overlapping structure
 *   all             - Run all analyses (default)
 *
 * Requirements:
 *   npm install -g typescript-language-server typescript  # For TypeScript/JavaScript
 *   npm install -g pyright                                # For Python
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

// ============================================================================
// LSP Client
// ============================================================================

interface Position {
  line: number;
  character: number;
}

interface Range {
  start: Position;
  end: Position;
}

interface Location {
  uri: string;
  range: Range;
}

interface Diagnostic {
  range: Range;
  severity: number;
  code?: string | number;
  source?: string;
  message: string;
}

interface LSPClientConfig {
  command: string;
  args: string[];
  rootUri: string;
  initializationOptions?: any;
}

class LSPClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private messageBuffer: string = '';
  private nextRequestId: number = 1;
  private pendingRequests: Map<number, { resolve: Function; reject: Function; timeout: NodeJS.Timeout }> = new Map();
  private initialized: boolean = false;
  private config: LSPClientConfig;

  constructor(config: LSPClientConfig) {
    super();
    this.config = config;
  }

  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.process = spawn(this.config.command, this.config.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (!this.process.stdout || !this.process.stdin || !this.process.stderr) {
        reject(new Error('Failed to create language server process streams'));
        return;
      }

      this.process.stdout.on('data', (data: Buffer) => this.handleData(data));
      this.process.stderr.on('data', () => {}); // Suppress stderr
      this.process.on('error', reject);
      this.process.on('exit', (code) => this.emit('exit', code));

      this.initialize().then(() => {
        this.initialized = true;
        resolve();
      }).catch(reject);
    });
  }

  private async initialize(): Promise<any> {
    const result = await this.sendRequest('initialize', {
      processId: process.pid,
      rootUri: this.config.rootUri,
      workspaceFolders: [{ uri: this.config.rootUri, name: 'workspace' }],
      capabilities: {
        textDocument: {
          synchronization: { didSave: true, didOpen: true, didClose: true, didChange: true },
          definition: { linkSupport: true },
          references: {},
          documentSymbol: { hierarchicalDocumentSymbolSupport: true },
          hover: { contentFormat: ['markdown', 'plaintext'] },
          signatureHelp: { signatureInformation: { parameterInformation: { labelOffsetSupport: true } } },
        },
        workspace: { applyEdit: true, workspaceFolders: true },
      },
      initializationOptions: this.config.initializationOptions || {},
    });
    await this.sendNotification('initialized', {});
    return result;
  }

  private handleData(data: Buffer): void {
    this.messageBuffer += data.toString();

    while (true) {
      const headerEnd = this.messageBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const headers = this.messageBuffer.substring(0, headerEnd);
      const contentLengthMatch = headers.match(/Content-Length: (\d+)/i);
      if (!contentLengthMatch) {
        this.messageBuffer = '';
        break;
      }

      const contentLength = parseInt(contentLengthMatch[1], 10);
      const messageStart = headerEnd + 4;
      const messageEnd = messageStart + contentLength;

      if (this.messageBuffer.length < messageEnd) break;

      const messageContent = this.messageBuffer.substring(messageStart, messageEnd);
      this.messageBuffer = this.messageBuffer.substring(messageEnd);

      try {
        this.handleMessage(JSON.parse(messageContent));
      } catch {}
    }
  }

  private handleMessage(message: any): void {
    if (message.id !== undefined) {
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        clearTimeout(pending.timeout);
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
    } else if (message.method) {
      this.emit('notification', message.method, message.params);
    }
  }

  private async sendRequest(method: string, params: any, timeoutMs: number = 10000): Promise<any> {
    if (!this.process?.stdin) throw new Error('Language server not started');

    const id = this.nextRequestId++;
    const content = JSON.stringify({ jsonrpc: '2.0', id, method, params });
    const header = `Content-Length: ${Buffer.byteLength(content, 'utf8')}\r\n\r\n`;
    this.process.stdin.write(header + content);

    return new Promise((resolve, reject) => {
      const timeout = setTimeout(() => {
        this.pendingRequests.delete(id);
        reject(new Error(`Request ${method} timed out`));
      }, timeoutMs);
      this.pendingRequests.set(id, { resolve, reject, timeout });
    });
  }

  private async sendNotification(method: string, params: any): Promise<void> {
    if (!this.process?.stdin) throw new Error('Language server not started');
    const content = JSON.stringify({ jsonrpc: '2.0', method, params });
    const header = `Content-Length: ${Buffer.byteLength(content, 'utf8')}\r\n\r\n`;
    this.process.stdin.write(header + content);
  }

  async openDocument(uri: string, languageId: string, version: number, text: string): Promise<void> {
    await this.sendNotification('textDocument/didOpen', {
      textDocument: { uri, languageId, version, text },
    });
  }

  async closeDocument(uri: string): Promise<void> {
    await this.sendNotification('textDocument/didClose', { textDocument: { uri } });
  }

  async findReferences(uri: string, position: Position, includeDeclaration: boolean = true): Promise<Location[]> {
    try {
      return await this.sendRequest('textDocument/references', {
        textDocument: { uri },
        position,
        context: { includeDeclaration },
      }, 5000) || [];
    } catch {
      return [];
    }
  }

  async documentSymbols(uri: string): Promise<any[]> {
    try {
      return await this.sendRequest('textDocument/documentSymbol', { textDocument: { uri } }, 5000) || [];
    } catch {
      return [];
    }
  }

  async hover(uri: string, position: Position): Promise<any> {
    try {
      return await this.sendRequest('textDocument/hover', { textDocument: { uri }, position }, 3000);
    } catch {
      return null;
    }
  }

  async shutdown(): Promise<void> {
    if (!this.initialized) return;
    try {
      await this.sendRequest('shutdown', {}, 2000);
      await this.sendNotification('exit', {});
    } catch {}
    this.process?.kill();
    this.process = null;
    this.initialized = false;
  }
}

// ============================================================================
// Server Configurations
// ============================================================================

interface ServerConfig {
  name: string;
  command: string;
  args: string[];
  languages: string[];
  fileExtensions: string[];
}

const SERVER_CONFIGS: Record<string, ServerConfig> = {
  typescript: {
    name: 'TypeScript/JavaScript',
    command: 'typescript-language-server',
    args: ['--stdio'],
    languages: ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'],
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  },
  python: {
    name: 'Python (Pyright)',
    command: 'pyright-langserver',
    args: ['--stdio'],
    languages: ['python'],
    fileExtensions: ['.py', '.pyi'],
  },
};

function isCommandAvailable(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

function detectLanguage(projectPath: string): string {
  if (fs.existsSync(path.join(projectPath, 'package.json')) ||
      fs.existsSync(path.join(projectPath, 'tsconfig.json'))) {
    return 'typescript';
  }
  if (fs.existsSync(path.join(projectPath, 'requirements.txt')) ||
      fs.existsSync(path.join(projectPath, 'setup.py')) ||
      fs.existsSync(path.join(projectPath, 'pyproject.toml'))) {
    return 'python';
  }
  return 'typescript';
}

// ============================================================================
// Analysis Types
// ============================================================================

interface SymbolInfo {
  name: string;
  fullName: string;
  kind: number;
  kindName: string;
  uri: string;
  file: string;
  range: Range;
  selectionRange?: Range;
  detail?: string;
  children?: SymbolInfo[];
}

interface SignatureGroup {
  signature: string;
  functions: Array<{ name: string; file: string; line: number }>;
}

interface CooccurrenceGroup {
  symbols: string[];
  files: string[];
  occurrenceCount: number;
}

interface DeadParameter {
  functionName: string;
  parameterName: string;
  file: string;
  line: number;
}

interface Hotspot {
  name: string;
  kind: string;
  file: string;
  line: number;
  referenceCount: number;
  referencingFiles: string[];
}

interface SimilarTypeGroup {
  types: Array<{ name: string; file: string; line: number; properties: string[] }>;
  sharedProperties: string[];
  similarity: number;
}

interface AnalysisResult {
  unusedSymbols: Array<{
    name: string;
    kind: string;
    file: string;
    line: number;
    referenceCount: number;
    confidence: 'high' | 'medium';
  }>;
  signatureGroups: SignatureGroup[];
  cooccurrenceGroups: CooccurrenceGroup[];
  deadParameters: DeadParameter[];
  hotspots: Hotspot[];
  similarTypes: SimilarTypeGroup[];
  diagnostics: Array<{
    file: string;
    line: number;
    severity: string;
    message: string;
    code?: string | number;
  }>;
  symbolCounts: {
    functions: number;
    classes: number;
    interfaces: number;
    variables: number;
  };
  filesAnalyzed: number;
}

const SYMBOL_KINDS: Record<number, string> = {
  1: 'file', 2: 'module', 3: 'namespace', 4: 'package', 5: 'class',
  6: 'method', 7: 'property', 8: 'field', 9: 'constructor', 10: 'enum',
  11: 'interface', 12: 'function', 13: 'variable', 14: 'constant',
  15: 'string', 16: 'number', 17: 'boolean', 18: 'array', 19: 'object',
  20: 'key', 21: 'null', 22: 'enummember', 23: 'struct', 24: 'event',
  25: 'operator', 26: 'typeparameter',
};

// ============================================================================
// Utility Functions
// ============================================================================

function findFiles(dir: string, extensions: string[], files: string[] = []): string[] {
  try {
    const entries = fs.readdirSync(dir, { withFileTypes: true });
    for (const entry of entries) {
      const fullPath = path.join(dir, entry.name);
      if (entry.isDirectory()) {
        if (!['node_modules', '.git', 'dist', 'build', '.next', 'coverage', '__pycache__', '.venv', 'venv', '.tox'].includes(entry.name)) {
          findFiles(fullPath, extensions, files);
        }
      } else if (entry.isFile() && extensions.includes(path.extname(entry.name))) {
        files.push(fullPath);
      }
    }
  } catch {}
  return files;
}

function pathToUri(filePath: string): string {
  return `file://${path.resolve(filePath)}`;
}

function uriToPath(uri: string): string {
  return uri.replace(/^file:\/\//, '');
}

function flattenSymbols(symbols: any[], uri: string, file: string, parentName?: string): SymbolInfo[] {
  const result: SymbolInfo[] = [];
  for (const sym of symbols) {
    const fullName = parentName ? `${parentName}.${sym.name}` : sym.name;
    const info: SymbolInfo = {
      name: sym.name,
      fullName,
      kind: sym.kind,
      kindName: SYMBOL_KINDS[sym.kind] || 'unknown',
      uri,
      file,
      range: sym.range,
      selectionRange: sym.selectionRange,
      detail: sym.detail,
    };
    result.push(info);
    if (sym.children) {
      result.push(...flattenSymbols(sym.children, uri, file, fullName));
    }
  }
  return result;
}

function extractSignature(detail: string | undefined): string {
  if (!detail) return 'unknown';
  // Normalize signature: remove names, keep types
  // e.g., "(name: string, age: number) => boolean" -> "(string, number) => boolean"
  return detail
    .replace(/\w+\s*:\s*/g, '') // Remove parameter names
    .replace(/\s+/g, ' ')        // Normalize whitespace
    .trim();
}

function extractTypeProperties(content: string, startLine: number, name: string): string[] {
  const lines = content.split('\n');
  const properties: string[] = [];
  let braceCount = 0;
  let started = false;

  for (let i = startLine; i < lines.length && i < startLine + 50; i++) {
    const line = lines[i];

    if (line.includes('{')) {
      started = true;
      braceCount += (line.match(/{/g) || []).length;
    }
    if (line.includes('}')) {
      braceCount -= (line.match(/}/g) || []).length;
    }

    if (started && braceCount > 0) {
      // Extract property names
      const propMatch = line.match(/^\s*(\w+)\s*[?]?\s*:/);
      if (propMatch) {
        properties.push(propMatch[1]);
      }
    }

    if (started && braceCount === 0) break;
  }

  return properties;
}

function calculateSimilarity(props1: string[], props2: string[]): { shared: string[]; similarity: number } {
  const set1 = new Set(props1);
  const set2 = new Set(props2);
  const shared = props1.filter(p => set2.has(p));
  const union = new Set([...props1, ...props2]);
  const similarity = union.size > 0 ? shared.length / union.size : 0;
  return { shared, similarity };
}

// ============================================================================
// Analysis Functions
// ============================================================================

async function analyzeProject(
  projectPath: string,
  language: string,
  analysisTypes: Set<string>
): Promise<AnalysisResult> {
  const config = SERVER_CONFIGS[language];
  if (!config) throw new Error(`Unsupported language: ${language}`);

  if (!isCommandAvailable(config.command)) {
    throw new Error(
      `Language server not found: ${config.command}\n` +
      `Install with: ${language === 'typescript' ? 'npm install -g typescript-language-server typescript' : 'npm install -g pyright'}`
    );
  }

  const rootUri = `file://${path.resolve(projectPath)}`;
  const client = new LSPClient({ command: config.command, args: config.args, rootUri });

  console.error(`[LSP] Starting ${config.name} language server...`);
  await client.start();
  console.error('[LSP] Server initialized');

  const files = findFiles(projectPath, config.fileExtensions);
  console.error(`[LSP] Found ${files.length} files to analyze`);

  const result: AnalysisResult = {
    unusedSymbols: [],
    signatureGroups: [],
    cooccurrenceGroups: [],
    deadParameters: [],
    hotspots: [],
    similarTypes: [],
    diagnostics: [],
    symbolCounts: { functions: 0, classes: 0, interfaces: 0, variables: 0 },
    filesAnalyzed: files.length,
  };

  // Collect all symbols and file contents
  const allSymbols: SymbolInfo[] = [];
  const fileContents: Map<string, string> = new Map();
  const diagnosticsMap = new Map<string, Diagnostic[]>();

  client.on('notification', (method: string, params: any) => {
    if (method === 'textDocument/publishDiagnostics') {
      diagnosticsMap.set(params.uri, params.diagnostics || []);
    }
  });

  // Phase 1: Open all files and collect symbols
  console.error('[LSP] Collecting symbols...');
  for (const file of files) {
    const uri = pathToUri(file);
    const content = fs.readFileSync(file, 'utf-8');
    fileContents.set(file, content);
    const languageId = config.languages[0];

    await client.openDocument(uri, languageId, 1, content);
    await new Promise(r => setTimeout(r, 30));

    const symbols = await client.documentSymbols(uri);
    if (symbols) {
      const relativePath = path.relative(projectPath, file);
      const flat = flattenSymbols(symbols, uri, relativePath);
      allSymbols.push(...flat);

      for (const sym of flat) {
        if (sym.kindName === 'function' || sym.kindName === 'method') result.symbolCounts.functions++;
        else if (sym.kindName === 'class') result.symbolCounts.classes++;
        else if (sym.kindName === 'interface') result.symbolCounts.interfaces++;
        else if (sym.kindName === 'variable' || sym.kindName === 'constant') result.symbolCounts.variables++;
      }
    }
  }

  // Wait for diagnostics
  await new Promise(r => setTimeout(r, 500));

  // Collect diagnostics
  for (const [uri, diags] of diagnosticsMap) {
    const file = uriToPath(uri);
    const relativePath = path.relative(projectPath, file);
    for (const diag of diags) {
      result.diagnostics.push({
        file: relativePath,
        line: diag.range.start.line + 1,
        severity: diag.severity === 1 ? 'error' : diag.severity === 2 ? 'warning' : 'info',
        message: diag.message,
        code: diag.code,
      });
    }
  }

  // Phase 2: Run selected analyses
  const runAll = analysisTypes.has('all');

  // Analysis: Unused symbols
  if (runAll || analysisTypes.has('unused')) {
    console.error('[LSP] Checking for unused symbols...');
    const exportableKinds = [5, 6, 11, 12]; // class, method, interface, function

    for (const sym of allSymbols) {
      if (!exportableKinds.includes(sym.kind)) continue;
      if (sym.name.startsWith('_') || sym.name.startsWith('#')) continue;

      const position = sym.selectionRange?.start || sym.range?.start;
      if (!position) continue;

      const refs = await client.findReferences(sym.uri, position, false);
      if (refs.length === 0) {
        result.unusedSymbols.push({
          name: sym.name,
          kind: sym.kindName,
          file: sym.file,
          line: position.line + 1,
          referenceCount: 0,
          confidence: sym.kind === 5 || sym.kind === 12 ? 'high' : 'medium',
        });
      }
    }
  }

  // Analysis: Similar signatures
  if (runAll || analysisTypes.has('signatures')) {
    console.error('[LSP] Analyzing function signatures...');
    const signatureMap = new Map<string, Array<{ name: string; file: string; line: number }>>();

    for (const sym of allSymbols) {
      if (sym.kindName !== 'function' && sym.kindName !== 'method') continue;
      if (sym.name.startsWith('_')) continue;

      const position = sym.selectionRange?.start || sym.range?.start;
      if (!position) continue;

      const hover = await client.hover(sym.uri, position);
      const hoverContent = hover?.contents?.value || hover?.contents || '';
      const signature = extractSignature(typeof hoverContent === 'string' ? hoverContent : JSON.stringify(hoverContent));

      if (signature && signature !== 'unknown') {
        if (!signatureMap.has(signature)) {
          signatureMap.set(signature, []);
        }
        signatureMap.get(signature)!.push({
          name: sym.fullName,
          file: sym.file,
          line: position.line + 1,
        });
      }
    }

    // Only keep signatures with 2+ functions
    for (const [signature, functions] of signatureMap) {
      if (functions.length >= 2) {
        result.signatureGroups.push({ signature, functions });
      }
    }
    result.signatureGroups.sort((a, b) => b.functions.length - a.functions.length);
  }

  // Analysis: Symbol co-occurrence
  if (runAll || analysisTypes.has('cooccurrence')) {
    console.error('[LSP] Analyzing symbol co-occurrence...');
    const symbolsByFile = new Map<string, Set<string>>();

    for (const sym of allSymbols) {
      if (sym.kindName !== 'function' && sym.kindName !== 'class' && sym.kindName !== 'interface') continue;
      if (!symbolsByFile.has(sym.file)) {
        symbolsByFile.set(sym.file, new Set());
      }
      symbolsByFile.get(sym.file)!.add(sym.name);
    }

    // Find symbol pairs that always appear together
    const pairCounts = new Map<string, { files: Set<string>; count: number }>();

    for (const [file, symbols] of symbolsByFile) {
      const symArray = Array.from(symbols);
      for (let i = 0; i < symArray.length; i++) {
        for (let j = i + 1; j < symArray.length; j++) {
          const pair = [symArray[i], symArray[j]].sort().join('|');
          if (!pairCounts.has(pair)) {
            pairCounts.set(pair, { files: new Set(), count: 0 });
          }
          pairCounts.get(pair)!.files.add(file);
          pairCounts.get(pair)!.count++;
        }
      }
    }

    // Filter pairs that appear in 3+ files
    for (const [pair, data] of pairCounts) {
      if (data.files.size >= 3) {
        const [sym1, sym2] = pair.split('|');
        result.cooccurrenceGroups.push({
          symbols: [sym1, sym2],
          files: Array.from(data.files),
          occurrenceCount: data.count,
        });
      }
    }
    result.cooccurrenceGroups.sort((a, b) => b.occurrenceCount - a.occurrenceCount);
  }

  // Analysis: Dead parameters
  if (runAll || analysisTypes.has('dead-params')) {
    console.error('[LSP] Checking for dead parameters...');

    for (const sym of allSymbols) {
      if (sym.kindName !== 'function' && sym.kindName !== 'method') continue;

      const fullPath = path.join(projectPath, sym.file);
      const content = fileContents.get(fullPath);
      if (!content) continue;

      const lines = content.split('\n');
      const startLine = sym.range.start.line;
      const endLine = Math.min(sym.range.end.line, lines.length - 1);

      // Extract function signature line
      const sigLine = lines[startLine] || '';
      const paramMatch = sigLine.match(/\(([^)]*)\)/);
      if (!paramMatch) continue;

      const params = paramMatch[1].split(',').map(p => {
        const nameMatch = p.trim().match(/^(\w+)/);
        return nameMatch ? nameMatch[1] : null;
      }).filter(Boolean) as string[];

      // Check if each parameter is used in function body
      const bodyLines = lines.slice(startLine + 1, endLine + 1).join('\n');

      for (const param of params) {
        if (param === 'self' || param === 'this' || param === 'cls') continue;

        // Check if parameter is used (as word boundary)
        const paramRegex = new RegExp(`\\b${param}\\b`);
        if (!paramRegex.test(bodyLines)) {
          result.deadParameters.push({
            functionName: sym.fullName,
            parameterName: param,
            file: sym.file,
            line: startLine + 1,
          });
        }
      }
    }
  }

  // Analysis: Hotspots (over-referenced symbols)
  if (runAll || analysisTypes.has('hotspots')) {
    console.error('[LSP] Finding hotspots...');
    const HOTSPOT_THRESHOLD = 10;

    for (const sym of allSymbols) {
      if (sym.kindName !== 'function' && sym.kindName !== 'class' && sym.kindName !== 'interface') continue;
      if (sym.name.startsWith('_')) continue;

      const position = sym.selectionRange?.start || sym.range?.start;
      if (!position) continue;

      const refs = await client.findReferences(sym.uri, position, false);
      if (refs.length >= HOTSPOT_THRESHOLD) {
        const referencingFiles = [...new Set(refs.map(r => path.relative(projectPath, uriToPath(r.uri))))];
        result.hotspots.push({
          name: sym.fullName,
          kind: sym.kindName,
          file: sym.file,
          line: position.line + 1,
          referenceCount: refs.length,
          referencingFiles,
        });
      }
    }
    result.hotspots.sort((a, b) => b.referenceCount - a.referenceCount);
  }

  // Analysis: Similar types/interfaces
  if (runAll || analysisTypes.has('similar-types')) {
    console.error('[LSP] Finding similar types...');
    const SIMILARITY_THRESHOLD = 0.5; // 50% shared properties

    const types: Array<{ name: string; file: string; line: number; properties: string[] }> = [];

    for (const sym of allSymbols) {
      if (sym.kindName !== 'interface' && sym.kindName !== 'class') continue;

      const fullPath = path.join(projectPath, sym.file);
      const content = fileContents.get(fullPath);
      if (!content) continue;

      const properties = extractTypeProperties(content, sym.range.start.line, sym.name);
      if (properties.length >= 2) {
        types.push({
          name: sym.fullName,
          file: sym.file,
          line: sym.range.start.line + 1,
          properties,
        });
      }
    }

    // Compare all pairs of types
    const processedPairs = new Set<string>();

    for (let i = 0; i < types.length; i++) {
      for (let j = i + 1; j < types.length; j++) {
        const t1 = types[i];
        const t2 = types[j];

        if (t1.name === t2.name) continue;

        const pairKey = [t1.name, t2.name].sort().join('|');
        if (processedPairs.has(pairKey)) continue;
        processedPairs.add(pairKey);

        const { shared, similarity } = calculateSimilarity(t1.properties, t2.properties);

        if (similarity >= SIMILARITY_THRESHOLD && shared.length >= 2) {
          result.similarTypes.push({
            types: [t1, t2],
            sharedProperties: shared,
            similarity: Math.round(similarity * 100),
          });
        }
      }
    }
    result.similarTypes.sort((a, b) => b.similarity - a.similarity);
  }

  // Cleanup
  for (const file of files) {
    await client.closeDocument(pathToUri(file));
  }
  await client.shutdown();
  console.error('[LSP] Analysis complete');

  return result;
}

// ============================================================================
// Output Formatting
// ============================================================================

function formatTextOutput(result: AnalysisResult): string {
  const lines: string[] = [];

  lines.push('\n=== LSP Code Quality Analysis ===\n');
  lines.push(`Files analyzed: ${result.filesAnalyzed}`);
  lines.push(`Functions: ${result.symbolCounts.functions}`);
  lines.push(`Classes: ${result.symbolCounts.classes}`);
  lines.push(`Interfaces: ${result.symbolCounts.interfaces}`);
  lines.push(`Variables: ${result.symbolCounts.variables}`);

  // Diagnostics
  if (result.diagnostics.length > 0) {
    const errors = result.diagnostics.filter(d => d.severity === 'error');
    const warnings = result.diagnostics.filter(d => d.severity === 'warning');
    lines.push(`\n--- Diagnostics ---`);
    lines.push(`Errors: ${errors.length}, Warnings: ${warnings.length}`);
    for (const d of errors.slice(0, 5)) {
      lines.push(`  [E] ${d.file}:${d.line} - ${d.message}`);
    }
    if (errors.length > 5) lines.push(`  ... and ${errors.length - 5} more errors`);
  }

  // Unused symbols
  if (result.unusedSymbols.length > 0) {
    lines.push(`\n--- Unused Symbols (${result.unusedSymbols.length}) ---`);
    for (const s of result.unusedSymbols.slice(0, 15)) {
      lines.push(`  ${s.kind} ${s.name} - ${s.file}:${s.line} [${s.confidence}]`);
    }
    if (result.unusedSymbols.length > 15) {
      lines.push(`  ... and ${result.unusedSymbols.length - 15} more`);
    }
  }

  // Similar signatures
  if (result.signatureGroups.length > 0) {
    lines.push(`\n--- Functions with Identical Signatures (${result.signatureGroups.length} groups) ---`);
    lines.push(`These functions have the same signature and may be consolidation candidates.\n`);
    for (const group of result.signatureGroups.slice(0, 5)) {
      lines.push(`  Signature: ${group.signature.substring(0, 60)}${group.signature.length > 60 ? '...' : ''}`);
      for (const f of group.functions.slice(0, 4)) {
        lines.push(`    - ${f.name} (${f.file}:${f.line})`);
      }
      if (group.functions.length > 4) {
        lines.push(`    ... and ${group.functions.length - 4} more`);
      }
      lines.push('');
    }
  }

  // Co-occurrence
  if (result.cooccurrenceGroups.length > 0) {
    lines.push(`\n--- Co-occurring Symbols (${result.cooccurrenceGroups.length} pairs) ---`);
    lines.push(`These symbols always appear together - candidates for extracting to a shared module.\n`);
    for (const group of result.cooccurrenceGroups.slice(0, 10)) {
      lines.push(`  ${group.symbols.join(' + ')} (${group.files.length} files)`);
    }
  }

  // Dead parameters
  if (result.deadParameters.length > 0) {
    lines.push(`\n--- Dead Parameters (${result.deadParameters.length}) ---`);
    lines.push(`These function parameters are never used in the function body.\n`);
    for (const p of result.deadParameters.slice(0, 15)) {
      lines.push(`  ${p.functionName}(${p.parameterName}) - ${p.file}:${p.line}`);
    }
    if (result.deadParameters.length > 15) {
      lines.push(`  ... and ${result.deadParameters.length - 15} more`);
    }
  }

  // Hotspots
  if (result.hotspots.length > 0) {
    lines.push(`\n--- Hotspots (${result.hotspots.length}) ---`);
    lines.push(`These symbols are referenced from many locations - consider abstraction.\n`);
    for (const h of result.hotspots.slice(0, 10)) {
      lines.push(`  ${h.kind} ${h.name} - ${h.referenceCount} refs from ${h.referencingFiles.length} files`);
    }
  }

  // Similar types
  if (result.similarTypes.length > 0) {
    lines.push(`\n--- Similar Types/Interfaces (${result.similarTypes.length} pairs) ---`);
    lines.push(`These types share properties - candidates for a common base type.\n`);
    for (const group of result.similarTypes.slice(0, 10)) {
      const t1 = group.types[0];
      const t2 = group.types[1];
      lines.push(`  ${t1.name} <-> ${t2.name} (${group.similarity}% similar)`);
      lines.push(`    Shared: ${group.sharedProperties.join(', ')}`);
      lines.push(`    ${t1.file}:${t1.line} | ${t2.file}:${t2.line}`);
      lines.push('');
    }
  }

  // Summary
  const issues = result.unusedSymbols.length + result.signatureGroups.length +
                 result.deadParameters.length + result.similarTypes.length;
  if (issues === 0) {
    lines.push('\nNo significant code quality issues detected.');
  } else {
    lines.push(`\n--- Summary ---`);
    lines.push(`Found ${issues} potential improvement areas.`);
  }

  return lines.join('\n');
}

// ============================================================================
// Main
// ============================================================================

async function main() {
  const args = process.argv.slice(2);

  if (args.length === 0 || args.includes('--help') || args.includes('-h')) {
    console.log(`
LSP-Based Code Quality Analysis

Usage:
  npx tsx analyze_with_lsp.ts <project-path> [options]

Options:
  --language <ts|py>       Force language (auto-detected by default)
  --output <json|text>     Output format (default: text)
  --analysis <type>        Run specific analysis (can be repeated)

Analysis types:
  unused          Find unused symbols (0 references)
  signatures      Find functions with identical signatures
  cooccurrence    Find symbols always used together
  dead-params     Find function parameters never used
  hotspots        Find over-referenced symbols
  similar-types   Find types with overlapping structure
  all             Run all analyses (default)

Examples:
  npx tsx analyze_with_lsp.ts .
  npx tsx analyze_with_lsp.ts ./src --analysis signatures --analysis similar-types
  npx tsx analyze_with_lsp.ts . --output json > report.json

Requirements:
  TypeScript: npm install -g typescript-language-server typescript
  Python:     npm install -g pyright
`);
    process.exit(0);
  }

  const projectPath = path.resolve(args[0]);
  if (!fs.existsSync(projectPath)) {
    console.error(`Error: Path not found: ${projectPath}`);
    process.exit(1);
  }

  let language = detectLanguage(projectPath);
  let outputFormat = 'text';
  const analysisTypes = new Set<string>();

  for (let i = 1; i < args.length; i++) {
    if (args[i] === '--language' && args[i + 1]) {
      language = args[i + 1] === 'py' ? 'python' : 'typescript';
      i++;
    } else if (args[i] === '--output' && args[i + 1]) {
      outputFormat = args[i + 1];
      i++;
    } else if (args[i] === '--analysis' && args[i + 1]) {
      analysisTypes.add(args[i + 1]);
      i++;
    }
  }

  if (analysisTypes.size === 0) {
    analysisTypes.add('all');
  }

  try {
    const result = await analyzeProject(projectPath, language, analysisTypes);

    if (outputFormat === 'json') {
      console.log(JSON.stringify(result, null, 2));
    } else {
      console.log(formatTextOutput(result));
    }
  } catch (error) {
    console.error('Error:', error instanceof Error ? error.message : error);
    process.exit(1);
  }
}

main();
