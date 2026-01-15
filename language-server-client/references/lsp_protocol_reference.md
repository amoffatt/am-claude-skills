# Language Server Protocol Reference

## Overview

The Language Server Protocol (LSP) is a protocol for communication between a code editor or IDE and a language server that provides language features like autocomplete, go to definition, find references, etc.

## Key Concepts

### Communication Protocol

- **Transport**: JSON-RPC 2.0 over stdin/stdout or sockets
- **Message Format**: Content-Length header followed by JSON payload
- **Request/Response**: Client sends requests with IDs, server responds with matching IDs
- **Notifications**: One-way messages without responses

### Lifecycle

1. **Initialize**: Client sends initialize request with capabilities
2. **Initialized**: Client sends initialized notification
3. **Work**: Client and server exchange requests/notifications
4. **Shutdown**: Client sends shutdown request
5. **Exit**: Client sends exit notification

## Common Message Types

### Requests (Client → Server)

#### `initialize`
- **Purpose**: First message, establishes client/server capabilities
- **Params**: `processId`, `rootUri`, `capabilities`, `initializationOptions`
- **Response**: Server capabilities

#### `textDocument/definition`
- **Purpose**: Go to definition
- **Params**: `textDocument.uri`, `position`
- **Response**: `Location | Location[] | null`

#### `textDocument/references`
- **Purpose**: Find all references
- **Params**: `textDocument.uri`, `position`, `context.includeDeclaration`
- **Response**: `Location[]`

#### `textDocument/hover`
- **Purpose**: Get hover information
- **Params**: `textDocument.uri`, `position`
- **Response**: `{ contents: MarkupContent | MarkedString }`

#### `textDocument/completion`
- **Purpose**: Get code completions
- **Params**: `textDocument.uri`, `position`
- **Response**: `CompletionList | CompletionItem[]`

#### `textDocument/documentSymbol`
- **Purpose**: Get document outline/symbols
- **Params**: `textDocument.uri`
- **Response**: `DocumentSymbol[] | SymbolInformation[]`

#### `textDocument/rename`
- **Purpose**: Rename symbol
- **Params**: `textDocument.uri`, `position`, `newName`
- **Response**: `WorkspaceEdit`

#### `textDocument/formatting`
- **Purpose**: Format entire document
- **Params**: `textDocument.uri`, `options`
- **Response**: `TextEdit[]`

#### `textDocument/codeAction`
- **Purpose**: Get available code actions (quick fixes, refactorings)
- **Params**: `textDocument.uri`, `range`, `context`
- **Response**: `(Command | CodeAction)[]`

### Notifications (Client → Server)

#### `initialized`
- **Purpose**: Sent after initialize response
- **Params**: Empty object

#### `textDocument/didOpen`
- **Purpose**: Document was opened
- **Params**: `textDocument` (uri, languageId, version, text)

#### `textDocument/didChange`
- **Purpose**: Document content changed
- **Params**: `textDocument.uri`, `contentChanges`

#### `textDocument/didSave`
- **Purpose**: Document was saved
- **Params**: `textDocument.uri`, `text?`

#### `textDocument/didClose`
- **Purpose**: Document was closed
- **Params**: `textDocument.uri`

### Notifications (Server → Client)

#### `textDocument/publishDiagnostics`
- **Purpose**: Server sends diagnostics (errors, warnings)
- **Params**: `uri`, `diagnostics[]`

#### `window/showMessage`
- **Purpose**: Show message to user
- **Params**: `type`, `message`

#### `window/logMessage`
- **Purpose**: Log message
- **Params**: `type`, `message`

## Data Structures

### Position
```typescript
interface Position {
  line: number;        // 0-based
  character: number;   // 0-based, UTF-16 code units
}
```

### Range
```typescript
interface Range {
  start: Position;
  end: Position;
}
```

### Location
```typescript
interface Location {
  uri: string;
  range: Range;
}
```

### Diagnostic
```typescript
interface Diagnostic {
  range: Range;
  severity?: DiagnosticSeverity;  // 1=Error, 2=Warning, 3=Info, 4=Hint
  code?: string | number;
  source?: string;
  message: string;
  relatedInformation?: DiagnosticRelatedInformation[];
}
```

### TextEdit
```typescript
interface TextEdit {
  range: Range;
  newText: string;
}
```

### WorkspaceEdit
```typescript
interface WorkspaceEdit {
  changes?: { [uri: string]: TextEdit[] };
  documentChanges?: (TextDocumentEdit | CreateFile | RenameFile | DeleteFile)[];
}
```

### Symbol Kinds

- 1: File
- 2: Module
- 3: Namespace
- 4: Package
- 5: Class
- 6: Method
- 7: Property
- 8: Field
- 9: Constructor
- 10: Enum
- 11: Interface
- 12: Function
- 13: Variable
- 14: Constant
- 15: String
- 16: Number
- 17: Boolean
- 18: Array
- 19: Object
- 20: Key
- 21: Null
- 22: EnumMember
- 23: Struct
- 24: Event
- 25: Operator
- 26: TypeParameter

## Common Patterns

### Opening and Analyzing a File

1. Send `textDocument/didOpen` notification
2. Wait for `textDocument/publishDiagnostics` notification
3. Send requests for symbols, hover info, etc.
4. Send `textDocument/didClose` when done

### Finding Symbol Usage

1. Send `textDocument/definition` to find where symbol is defined
2. Send `textDocument/references` to find all usages
3. Combine results to build usage graph

### Refactoring

1. Send `textDocument/rename` or `textDocument/codeAction`
2. Receive `WorkspaceEdit` with all changes
3. Apply changes to files

## Error Handling

- **Invalid requests**: Server returns error with code and message
- **Timeout**: Client should timeout requests after reasonable period
- **Crash recovery**: If server exits unexpectedly, client should restart

## Performance Considerations

- **Incremental updates**: Use `textDocument/didChange` with incremental changes
- **Batch operations**: Close documents when done to free server memory
- **Debouncing**: Don't send too many requests too quickly
- **Caching**: Cache results where appropriate (hover info, etc.)

## Useful Links

- LSP Specification: https://microsoft.github.io/language-server-protocol/
- LSP Implementations: https://langserver.org/
- JSON-RPC 2.0: https://www.jsonrpc.org/specification
