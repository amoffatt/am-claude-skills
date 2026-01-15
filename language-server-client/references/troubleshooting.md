# Language Server Troubleshooting Guide

## Common Issues and Solutions

### Server Won't Start

#### Symptom
Error: "Language server not started" or process exits immediately

#### Solutions

1. **Check command availability**
   ```bash
   which typescript-language-server
   which pyright-langserver
   # etc.
   ```

2. **Verify installation**
   ```bash
   npm list -g typescript-language-server
   ```

3. **Check PATH**
   Ensure language server binaries are in your PATH
   ```bash
   echo $PATH
   ```

4. **Test manually**
   ```bash
   typescript-language-server --stdio
   # Should wait for input, not exit immediately
   ```

### No Diagnostics Received

#### Symptom
No errors/warnings appear even though they should

#### Solutions

1. **Wait longer**
   Some servers take time to analyze large codebases
   ```typescript
   // Increase timeout
   await new Promise(resolve => setTimeout(resolve, 5000));
   ```

2. **Check document is opened**
   ```typescript
   await client.openDocument(uri, languageId, 1, content);
   ```

3. **Verify file is in workspace**
   File URI must be under the rootUri workspace

4. **Listen for notifications**
   ```typescript
   client.on('notification', (method, params) => {
     console.log('Notification:', method, params);
   });
   ```

5. **Check project configuration**
   - TypeScript: Ensure `tsconfig.json` exists and includes the file
   - Python: Check `pyrightconfig.json` or `pyproject.toml`
   - Rust: Verify `Cargo.toml` is valid

### Completions Not Working

#### Symptom
Empty or no completion results

#### Solutions

1. **Verify document is open**
   Must call `openDocument` before requesting completions

2. **Check position is valid**
   ```typescript
   // Position should be 0-based
   const position = { line: 0, character: 0 };
   ```

3. **Wait for server initialization**
   ```typescript
   await client.start();
   // Server is now ready
   ```

4. **Check server capabilities**
   Not all servers support all features
   ```typescript
   const initResult = await initialize();
   console.log(initResult.capabilities);
   ```

### Go to Definition Returns Null

#### Symptom
`gotoDefinition` returns `null` for valid symbols

#### Solutions

1. **Ensure file is indexed**
   Large projects may need time to index
   ```typescript
   // Wait for initial indexing
   await new Promise(resolve => setTimeout(resolve, 3000));
   ```

2. **Check symbol is defined in workspace**
   External library symbols may not be available

3. **Verify position is on symbol**
   Position must be on the identifier, not whitespace

4. **Try with document opened**
   ```typescript
   await client.openDocument(uri, languageId, 1, content);
   const def = await client.gotoDefinition(uri, position);
   ```

### High Memory Usage

#### Symptom
Language server process consumes too much memory

#### Solutions

1. **Close documents when done**
   ```typescript
   await client.closeDocument(uri);
   ```

2. **Exclude large directories**
   - TypeScript: Add to `exclude` in tsconfig.json
   - Python: Use `exclude` in pyrightconfig.json

3. **Limit workspace scope**
   Only include necessary directories in workspace

4. **Restart server periodically**
   ```typescript
   await client.shutdown();
   await client.start();
   ```

### Slow Performance

#### Symptom
Requests take a long time to complete

#### Solutions

1. **Enable caching**
   Keep documents open if accessing multiple times

2. **Use incremental updates**
   Instead of reopening, send `didChange` notifications

3. **Batch requests**
   Don't send requests in tight loops

4. **Check server load**
   ```bash
   ps aux | grep language-server
   ```

5. **Optimize project configuration**
   - Enable `skipLibCheck` (TypeScript)
   - Use `basic` type checking mode (Python)
   - Exclude test files if not needed

### Position Encoding Issues

#### Symptom
Wrong positions or ranges returned

#### Solutions

1. **Verify UTF-16 encoding**
   LSP uses UTF-16 code units for character positions
   ```typescript
   // Convert UTF-8 offset to UTF-16
   function utf8ToUtf16Position(text: string, utf8Offset: number): Position {
     const substr = text.substring(0, utf8Offset);
     const lines = substr.split('\n');
     const line = lines.length - 1;
     const character = [...lines[line]].length; // UTF-16 code units
     return { line, character };
   }
   ```

2. **Use 0-based indexing**
   All positions are 0-based (line 0, character 0)

### Communication Errors

#### Symptom
"Invalid JSON" or "Parse error" messages

#### Solutions

1. **Check message format**
   ```typescript
   const header = `Content-Length: ${length}\r\n\r\n`;
   ```

2. **Verify JSON is valid**
   ```typescript
   JSON.parse(messageContent); // Should not throw
   ```

3. **Check for buffer issues**
   Ensure complete messages are read before parsing

4. **Enable debug logging**
   ```typescript
   process.stdin.on('data', data => {
     console.log('Received:', data.toString());
   });
   ```

### Server Crashes

#### Symptom
Server process exits unexpectedly

#### Solutions

1. **Check stderr output**
   ```typescript
   this.process.stderr.on('data', data => {
     console.error('[Server Error]:', data.toString());
   });
   ```

2. **Monitor exit events**
   ```typescript
   this.process.on('exit', (code, signal) => {
     console.log(`Exit: code=${code}, signal=${signal}`);
   });
   ```

3. **Validate request parameters**
   Ensure all required fields are present and valid

4. **Check server logs**
   Most servers write logs to temp directories

5. **Test with minimal example**
   Isolate the issue with a small test case

### Workspace Configuration Issues

#### Symptom
Server doesn't recognize project structure

#### Solutions

1. **Use absolute file URIs**
   ```typescript
   const uri = `file://${path.resolve(filePath)}`;
   ```

2. **Set correct rootUri**
   Should point to project root, not individual file

3. **Configure workspace folders**
   ```typescript
   workspaceFolders: [
     { uri: 'file:///path/to/project', name: 'project' }
   ]
   ```

4. **Check file is under rootUri**
   Files outside workspace may not be analyzed

## Debugging Techniques

### Enable Verbose Logging

```typescript
class LSPClient extends EventEmitter {
  private debug = true;

  private log(...args: any[]) {
    if (this.debug) {
      console.log('[LSP]', ...args);
    }
  }
}
```

### Inspect All Messages

```typescript
client.on('notification', (method, params) => {
  console.log('←', method, JSON.stringify(params, null, 2));
});
```

### Test with Known Working Client

Compare behavior with VS Code or other working editors

### Check Protocol Compliance

Refer to LSP specification: https://microsoft.github.io/language-server-protocol/

### Use Language Server Test Suite

Many servers have test suites you can run to verify installation

## Platform-Specific Issues

### macOS

- **Permission issues**: Grant terminal full disk access
- **Rosetta**: Some servers may need Rosetta on Apple Silicon
- **PATH**: Add language servers to `~/.zshrc` or `~/.bash_profile`

### Linux

- **Permissions**: Ensure language server is executable (`chmod +x`)
- **Dependencies**: Install required system libraries
- **PATH**: Update `~/.bashrc` or `~/.profile`

### Windows

- **Command format**: Use `.cmd` or `.exe` extension
- **Path separators**: Use forward slashes in URIs
- **Line endings**: Handle CRLF properly

## Getting Help

1. **Check language server documentation**
   Each server has its own docs and issue tracker

2. **Enable debug logging**
   Most servers support verbose logging flags

3. **Search existing issues**
   Many problems are already documented

4. **Create minimal reproduction**
   Isolate the issue to smallest possible example

5. **Provide version information**
   Include server version, Node.js version, OS, etc.
