---
name: language-server-client
description: Write TypeScript code to interact with and run Language Server Protocol (LSP) servers for codebase analysis, navigation, diagnostics, completions, refactoring, and code intelligence. Use when implementing LSP clients, analyzing code with language servers, finding definitions/references, getting diagnostics/type errors, performing renames/refactorings, or integrating language servers into tools.
---

# Language Server Client

## Overview

This skill provides comprehensive TypeScript implementations and workflows for building Language Server Protocol (LSP) clients. Use this skill to write code that communicates with language servers to analyze codebases, navigate code, get diagnostics, perform refactorings, and integrate language intelligence into applications or tools.

## Core Capabilities

### 1. LSP Client Implementation

Create TypeScript LSP clients that communicate with any LSP-compliant language server using the reusable `lsp_client.ts` script.

**When to use:** Implement a new LSP client from scratch or customize client behavior.

**Key operations:**
- Initialize connection with language server
- Send requests (definitions, references, hover, completions, etc.)
- Handle notifications (diagnostics, messages)
- Manage document lifecycle (open, change, close)
- Graceful shutdown

**Example usage:**
```typescript
import { LSPClient } from './scripts/lsp_client';

const client = new LSPClient({
  command: 'typescript-language-server',
  args: ['--stdio'],
  rootUri: 'file:///path/to/project'
});

await client.start();

// Open a document
await client.openDocument(
  'file:///path/to/file.ts',
  'typescript',
  1,
  fileContent
);

// Get definition
const definition = await client.gotoDefinition(
  'file:///path/to/file.ts',
  { line: 10, character: 5 }
);

await client.shutdown();
```

### 2. Code Navigation Operations

Implement code navigation features using `lsp_operations.ts` for common workflows:

- **Go to definition:** Find where symbols are defined
- **Find references:** Locate all usages of a symbol
- **Find implementations:** Discover interface implementations
- **Document symbols:** Extract document outline/structure
- **Call graphs:** Build symbol usage hierarchies

**Example: Finding all references to a symbol**
```typescript
import { findSymbolReferences } from './scripts/lsp_operations';

const refs = await findSymbolReferences(
  client,
  'file:///src/utils.ts',
  { line: 15, character: 10 }
);

console.log(`Symbol: ${refs.symbol}`);
console.log(`Used ${refs.usageCount} times`);
refs.references.forEach(ref => {
  console.log(`- ${ref.uri}:${ref.range.start.line}`);
});
```

### 3. Codebase Analysis

Analyze entire projects to gather diagnostics, symbols, and code quality metrics.

**Use cases:**
- Find all errors/warnings in a codebase
- Extract all functions/classes from project files
- Build symbol indices
- Generate code quality reports

**Example: Analyzing a TypeScript project**
```typescript
import { analyzeCodebase } from './scripts/lsp_operations';

const analysis = await analyzeCodebase(
  client,
  '/path/to/project',
  /\.(ts|tsx)$/
);

console.log(`Analyzed ${analysis.totalFiles} files`);
console.log(`Errors: ${analysis.errorCount}`);
console.log(`Warnings: ${analysis.warningCount}`);

// Access diagnostics per file
analysis.diagnostics.forEach((diags, uri) => {
  console.log(`${uri}: ${diags.length} issues`);
});
```

### 4. Code Intelligence Features

Implement IDE-like features in custom tools:

- **Completions:** Autocomplete suggestions
- **Hover info:** Symbol documentation and type information
- **Signature help:** Function parameter hints
- **Code actions:** Quick fixes and refactorings

**Example: Getting completions**
```typescript
import { getCompletions } from './scripts/lsp_operations';

const completions = await getCompletions(
  client,
  '/path/to/file.ts',
  { line: 20, character: 8 }
);

completions.items.forEach(item => {
  console.log(`${item.label}: ${item.kind}`);
});
```

### 5. Code Transformations

Perform refactoring operations across codebases:

- **Rename symbol:** Rename variables/functions/classes across all files
- **Format documents:** Apply consistent code formatting
- **Organize imports:** Sort and clean up imports
- **Apply code actions:** Execute quick fixes

**Example: Renaming a symbol**
```typescript
import { renameSymbol } from './scripts/lsp_operations';

const workspaceEdit = await renameSymbol(
  client,
  'file:///src/utils.ts',
  { line: 10, character: 9 },
  'newFunctionName'
);

// workspaceEdit contains all file changes needed
Object.entries(workspaceEdit.changes).forEach(([uri, edits]) => {
  console.log(`${uri}: ${edits.length} changes`);
});
```

### 6. Language Server Launcher

Automatically detect and configure language servers for any project using `server_launcher.ts`.

**Supported languages:**
- TypeScript/JavaScript (typescript-language-server)
- Python (Pyright)
- Rust (rust-analyzer)
- Go (gopls)
- C/C++ (clangd)
- Java (Eclipse JDT.LS)
- Swift (SourceKit-LSP)
- C# (OmniSharp)
- HTML, CSS, JSON (vscode-langservers)
- Custom servers via configuration

**Example: Auto-detecting and launching**
```typescript
import { launchAutoDetected, detectLanguageServer } from './scripts/server_launcher';

// Automatically detect project type and launch appropriate server
const client = await launchAutoDetected('/path/to/project');

if (!client) {
  console.error('Could not detect language server');
} else {
  // Client is ready to use
  const symbols = await client.documentSymbols('file:///path/to/file');
}
```

**Example: Manual configuration**
```typescript
import { launchLanguageServer, SERVER_CONFIGS } from './scripts/server_launcher';

const config = SERVER_CONFIGS.typescript;
const client = await launchLanguageServer(config, '/path/to/project');
```

**Example: Custom language server**
```typescript
import { createCustomConfig, launchLanguageServer } from './scripts/server_launcher';

const customConfig = createCustomConfig(
  'my-language-server',
  ['--stdio', '--verbose'],
  ['mylang'],
  ['.mylang'],
  { customOption: true }
);

const client = await launchLanguageServer(customConfig, '/path/to/project');
```

## Workflow Patterns

### Pattern 1: One-off Analysis

For single-use operations (e.g., "find all references to this function"):

1. Launch language server with auto-detection
2. Perform operation
3. Shutdown client

```typescript
const client = await launchAutoDetected(projectPath);
const refs = await findSymbolReferences(client, fileUri, position);
await client.shutdown();
```

### Pattern 2: Batch Processing

For processing multiple files or operations:

1. Launch language server once
2. Open/close documents as needed
3. Accumulate results
4. Shutdown when done

```typescript
const client = await launchAutoDetected(projectPath);

for (const file of files) {
  const diagnostics = await getFileDiagnostics(client, file);
  results.set(file, diagnostics);
}

await client.shutdown();
```

### Pattern 3: Long-running Session

For interactive tools or servers:

1. Launch language server
2. Keep alive and handle requests
3. Listen for notifications (diagnostics, etc.)
4. Shutdown on exit

```typescript
const client = await launchAutoDetected(projectPath);

// Listen for diagnostics
client.on('notification', (method, params) => {
  if (method === 'textDocument/publishDiagnostics') {
    handleDiagnostics(params);
  }
});

// Keep running...
```

### Pattern 4: Building Tools

For integrating LSP into custom applications:

1. Embed LSP client in your tool
2. Expose LSP operations via your API
3. Handle document synchronization
4. Manage client lifecycle

Refer to `lsp_client.ts` and `lsp_operations.ts` for building blocks.

## Project Setup

### Quick Start

1. **Copy template files:**
   ```bash
   cp assets/package.json ./
   cp assets/tsconfig.json ./
   ```

2. **Install dependencies:**
   ```bash
   npm install
   ```

3. **Install language server(s):**
   ```bash
   # TypeScript/JavaScript
   npm install -g typescript-language-server typescript

   # Python
   npm install -g pyright

   # See references/common_servers.md for more
   ```

4. **Copy and use scripts:**
   ```bash
   cp scripts/*.ts ./
   ```

5. **Run TypeScript code:**
   ```bash
   npx tsx your-script.ts
   ```

### Integration into Existing Projects

Copy only the scripts needed:
- `lsp_client.ts` - Core LSP client
- `lsp_operations.ts` - High-level operations
- `server_launcher.ts` - Language server management

Import and use in your TypeScript code.

## Reference Documentation

### references/lsp_protocol_reference.md

Complete LSP protocol reference including:
- Message formats and communication protocol
- Request/response types
- Data structures (Position, Range, Location, etc.)
- Symbol kinds and diagnostic severity levels
- Common patterns and best practices

**When to read:** Implement custom LSP operations not covered by the scripts, debug protocol issues, or understand LSP internals.

### references/common_servers.md

Configuration examples for popular language servers:
- Installation instructions
- Server-specific configuration options
- Project setup requirements (tsconfig.json, pyrightconfig.json, etc.)
- Initialization options
- Performance optimization tips

**When to read:** Configure a specific language server, troubleshoot server-specific issues, or optimize server performance.

### references/troubleshooting.md

Solutions to common problems:
- Server won't start
- No diagnostics received
- Completions not working
- Position encoding issues
- High memory usage
- Platform-specific issues

**When to read:** Encounter issues with language servers, debug communication problems, or optimize performance.

## Common Use Cases

### Use Case 1: Finding All Type Errors

```typescript
import { launchAutoDetected } from './scripts/server_launcher';
import { analyzeCodebase } from './scripts/lsp_operations';

const client = await launchAutoDetected('/path/to/project');
const analysis = await analyzeCodebase(client, '/path/to/project');

// Filter for errors only
const errors = new Map();
analysis.diagnostics.forEach((diags, uri) => {
  const fileErrors = diags.filter(d => d.severity === 1);
  if (fileErrors.length > 0) {
    errors.set(uri, fileErrors);
  }
});

console.log(`Found ${analysis.errorCount} errors in ${errors.size} files`);
await client.shutdown();
```

### Use Case 2: Building a Call Graph

```typescript
import { launchAutoDetected } from './scripts/server_launcher';
import { buildCallGraph } from './scripts/lsp_operations';

const client = await launchAutoDetected('/path/to/project');

const callGraph = await buildCallGraph(
  client,
  'file:///src/index.ts',
  { line: 50, character: 10 },
  3 // depth
);

console.log(JSON.stringify(callGraph, null, 2));
await client.shutdown();
```

### Use Case 3: Finding All Functions in a Project

```typescript
import { launchAutoDetected } from './scripts/server_launcher';
import { findSymbolsByKind } from './scripts/lsp_operations';

const client = await launchAutoDetected('/path/to/project');

// Symbol kind 12 = Function
const functions = await findSymbolsByKind(client, '/path/to/project', 12);

functions.forEach((symbols, file) => {
  console.log(`\n${file}:`);
  symbols.forEach(sym => console.log(`  - ${sym.name}`));
});

await client.shutdown();
```

### Use Case 4: Interactive Code Explorer

```typescript
import { launchAutoDetected } from './scripts/server_launcher';
import * as readline from 'readline';

const client = await launchAutoDetected(process.cwd());

const rl = readline.createInterface({
  input: process.stdin,
  output: process.stdout
});

rl.on('line', async (input) => {
  const [command, ...args] = input.split(' ');

  if (command === 'def') {
    const [file, line, char] = args;
    const def = await client.gotoDefinition(
      `file://${file}`,
      { line: parseInt(line), character: parseInt(char) }
    );
    console.log(def);
  }
  // Add more commands...
});
```

## Best Practices

1. **Always shutdown clients:** Call `client.shutdown()` when done to free resources
2. **Close documents:** Use `closeDocument()` after operations to reduce memory
3. **Handle errors:** Wrap LSP calls in try-catch blocks
4. **Wait for initialization:** Ensure `client.start()` completes before sending requests
5. **Use appropriate timeouts:** Some operations (indexing) take time
6. **Batch operations:** Keep documents open for multiple operations
7. **Monitor notifications:** Listen for diagnostics and other server messages
8. **Validate positions:** Ensure line/character positions are valid and 0-based
9. **Use correct encoding:** LSP uses UTF-16 character positions
10. **Check server capabilities:** Not all servers support all features

## Debugging Tips

1. **Enable logging:** Add console.log statements in `handleMessage()` and `sendRequest()`
2. **Inspect messages:** Log all incoming/outgoing JSON-RPC messages
3. **Check stderr:** Monitor language server stderr for error messages
4. **Test manually:** Use `echo` and pipe to test server directly
5. **Verify installation:** Use `which` to check server is in PATH
6. **Read server docs:** Each server has specific configuration requirements
7. **Start simple:** Test with minimal example before complex operations
8. **Check project config:** Verify tsconfig.json, pyrightconfig.json, etc.

Refer to `references/troubleshooting.md` for detailed debugging guidance.

## Resources

### scripts/

Executable TypeScript modules for LSP client implementation:

- **lsp_client.ts** - Core LSP client with full protocol support
- **lsp_operations.ts** - High-level operations and workflows
- **server_launcher.ts** - Language server detection and configuration

These scripts can be copied into projects and imported as TypeScript modules.

### references/

In-depth documentation for LSP implementation:

- **lsp_protocol_reference.md** - Complete LSP protocol specification
- **common_servers.md** - Language server configurations and setup
- **troubleshooting.md** - Solutions to common issues

Load these when implementing custom LSP features or debugging issues.

### assets/

Template files for new projects:

- **package.json** - Node.js project template with required dependencies
- **tsconfig.json** - TypeScript configuration optimized for LSP development

Copy these to bootstrap new LSP client projects.
