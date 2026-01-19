# Common Language Server Configurations

This document provides configuration examples and setup instructions for popular language servers.

## TypeScript/JavaScript (typescript-language-server)

### Installation
```bash
npm install -g typescript-language-server typescript
```

### Configuration
```typescript
{
  command: 'typescript-language-server',
  args: ['--stdio'],
  rootUri: 'file:///path/to/project',
  initializationOptions: {
    preferences: {
      includeInlayParameterNameHints: 'all',
      includeInlayFunctionParameterTypeHints: true,
      includeInlayPropertyDeclarationTypeHints: true,
    }
  }
}
```

### Project Setup
Ensure `tsconfig.json` exists in project root:
```json
{
  "compilerOptions": {
    "target": "ES2020",
    "module": "commonjs",
    "strict": true,
    "esModuleInterop": true,
    "skipLibCheck": true,
    "forceConsistentCasingInFileNames": true
  },
  "include": ["src/**/*"],
  "exclude": ["node_modules"]
}
```

## Python (Pyright)

### Installation
```bash
npm install -g pyright
```

### Configuration
```typescript
{
  command: 'pyright-langserver',
  args: ['--stdio'],
  rootUri: 'file:///path/to/project',
  initializationOptions: {
    settings: {
      python: {
        analysis: {
          typeCheckingMode: 'basic',
          autoSearchPaths: true,
          useLibraryCodeForTypes: true,
        }
      }
    }
  }
}
```

### Project Setup
Create `pyrightconfig.json`:
```json
{
  "include": ["src"],
  "exclude": ["**/node_modules", "**/__pycache__"],
  "typeCheckingMode": "basic",
  "pythonVersion": "3.10"
}
```

## Rust (rust-analyzer)

### Installation
```bash
rustup component add rust-analyzer
```

### Configuration
```typescript
{
  command: 'rust-analyzer',
  args: [],
  rootUri: 'file:///path/to/project',
  initializationOptions: {
    cargo: {
      buildScripts: {
        enable: true
      }
    },
    procMacro: {
      enable: true
    }
  }
}
```

### Project Setup
Requires `Cargo.toml` in project root. No additional config needed.

## Go (gopls)

### Installation
```bash
go install golang.org/x/tools/gopls@latest
```

### Configuration
```typescript
{
  command: 'gopls',
  args: [],
  rootUri: 'file:///path/to/project',
  initializationOptions: {
    usePlaceholders: true,
    completionDocumentation: true,
    deepCompletion: true,
  }
}
```

### Project Setup
Requires `go.mod` in project root:
```bash
go mod init myproject
```

## C/C++ (clangd)

### Installation
```bash
# macOS
brew install llvm

# Ubuntu
sudo apt-get install clangd-12

# Arch Linux
sudo pacman -S clangd
```

### Configuration
```typescript
{
  command: 'clangd',
  args: ['--background-index', '--clang-tidy'],
  rootUri: 'file:///path/to/project',
  initializationOptions: {
    clangdFileStatus: true,
    fallbackFlags: ['-std=c++17']
  }
}
```

### Project Setup
Create `compile_commands.json` or use CMake:
```bash
cmake -DCMAKE_EXPORT_COMPILE_COMMANDS=1
```

## Java (Eclipse JDT.LS)

### Installation
Download from: https://download.eclipse.org/jdtls/snapshots/

### Configuration
```typescript
{
  command: 'jdtls',
  args: [
    '-data', '/path/to/workspace',
    '-configuration', '/path/to/config'
  ],
  rootUri: 'file:///path/to/project',
  initializationOptions: {
    bundles: [],
    workspaceFolders: ['file:///path/to/project']
  }
}
```

### Project Setup
Requires Maven (`pom.xml`) or Gradle (`build.gradle`).

## HTML (vscode-html-language-server)

### Installation
```bash
npm install -g vscode-langservers-extracted
```

### Configuration
```typescript
{
  command: 'vscode-html-language-server',
  args: ['--stdio'],
  rootUri: 'file:///path/to/project',
  initializationOptions: {
    embeddedLanguages: {
      css: true,
      javascript: true
    },
    provideFormatter: true
  }
}
```

## CSS (vscode-css-language-server)

### Installation
```bash
npm install -g vscode-langservers-extracted
```

### Configuration
```typescript
{
  command: 'vscode-css-language-server',
  args: ['--stdio'],
  rootUri: 'file:///path/to/project',
  initializationOptions: {
    provideFormatter: true,
    validate: true
  }
}
```

## JSON (vscode-json-language-server)

### Installation
```bash
npm install -g vscode-langservers-extracted
```

### Configuration
```typescript
{
  command: 'vscode-json-language-server',
  args: ['--stdio'],
  rootUri: 'file:///path/to/project',
  initializationOptions: {
    provideFormatter: true,
    schemas: [
      {
        fileMatch: ['package.json'],
        url: 'https://json.schemastore.org/package.json'
      }
    ]
  }
}
```

## Swift (SourceKit-LSP)

### Installation
```bash
# macOS: Included with Xcode Command Line Tools
xcode-select --install

# Linux/Other: Install Swift toolchain from https://swift.org/download/
# SourceKit-LSP is included in the toolchain
```

### Configuration
```typescript
{
  command: 'sourcekit-lsp',
  args: [],
  rootUri: 'file:///path/to/project',
  initializationOptions: {}
}
```

### Project Setup
Create `Package.swift` for Swift Package Manager projects:
```swift
// swift-tools-version:5.7
import PackageDescription

let package = Package(
    name: "MyProject",
    platforms: [.macOS(.v12)],
    dependencies: [],
    targets: [
        .executableTarget(
            name: "MyProject",
            dependencies: [])
    ]
)
```

Or use Xcode project (`.xcodeproj`) for iOS/macOS development.

### Notes
- Works with Swift Package Manager and Xcode projects
- Requires Swift 5.6+ for best results
- Supports iOS, macOS, Linux, and other Swift platforms
- Provides code completion, diagnostics, and refactoring

## C# (OmniSharp)

### Installation
```bash
# Option 1: Using .NET tool
dotnet tool install -g csharp-ls

# Option 2: Download OmniSharp-Roslyn
# Download from: https://github.com/OmniSharp/omnisharp-roslyn/releases
# Extract and add to PATH
```

### Configuration
```typescript
{
  command: 'omnisharp',
  args: ['--languageserver'],
  rootUri: 'file:///path/to/project',
  initializationOptions: {
    FormattingOptions: {
      EnableEditorConfigSupport: true,
      OrganizeImports: true
    },
    RoslynExtensionsOptions: {
      EnableAnalyzersSupport: true,
      EnableImportCompletion: true
    }
  }
}
```

### Project Setup
Requires `.csproj` or `.sln` file:

**Simple console app (.csproj):**
```xml
<Project Sdk="Microsoft.NET.Sdk">
  <PropertyGroup>
    <OutputType>Exe</OutputType>
    <TargetFramework>net8.0</TargetFramework>
    <Nullable>enable</Nullable>
  </PropertyGroup>
</Project>
```

**Create new project:**
```bash
dotnet new console -n MyProject
cd MyProject
```

### Notes
- Supports .NET Framework, .NET Core, and .NET 5+
- Works with C# 11 and latest features
- Provides IntelliSense, refactoring, and code fixes
- Can use `.editorconfig` for formatting preferences
- May require running `dotnet restore` before first use

## Custom Language Server

For languages not listed here, consult https://langserver.org/ to find available language servers.

### Generic Configuration Template
```typescript
{
  command: 'language-server-command',
  args: ['--stdio'],  // Most use stdio, some use sockets
  rootUri: 'file:///path/to/project',
  initializationOptions: {
    // Server-specific options here
  }
}
```

## Debugging Language Server Issues

### Enable Logging
Most language servers support logging via environment variables:

```bash
# TypeScript
TSS_LOG="-level verbose -file /tmp/tsserver.log"

# Pyright
PYRIGHT_PYTHON_FORCE_VERSION=latest

# Rust
RUST_LOG=debug

# Go
GOPLS_LOGFILE=/tmp/gopls.log
```

### Common Issues

1. **Server not starting**: Check command is in PATH
2. **No completions**: Verify initializationOptions match server expectations
3. **Slow performance**: Reduce workspace size, exclude large directories
4. **Wrong diagnostics**: Check project configuration files (tsconfig.json, etc.)

### Testing Server Manually
```bash
# Start server and send initialize request
echo '{"jsonrpc":"2.0","id":1,"method":"initialize","params":{"rootUri":"file:///path"}}' | language-server --stdio
```

## Performance Optimization

### TypeScript/JavaScript
- Use project references for monorepos
- Exclude `node_modules` from includes
- Enable `skipLibCheck` in tsconfig.json

### Python
- Limit analysis scope with `include`/`exclude`
- Use virtual environments
- Set appropriate `typeCheckingMode` (basic vs strict)

### Rust
- Use `cargo check` for faster builds
- Enable incremental compilation
- Consider `rust-analyzer.cargo.target` for cross-compilation

### C/C++
- Generate `compile_commands.json` for accurate analysis
- Use `.clangd` config file to exclude directories
- Enable background indexing with `--background-index`

### Swift
- Keep `Package.swift` dependencies up to date
- Use `.swift-version` to specify Swift version
- Exclude build directories (`.build/`, `DerivedData/`)
- Close unused Xcode projects to reduce indexing load

### C#
- Run `dotnet restore` before starting language server
- Use solution filters (`.slnf`) for large solutions
- Enable incremental build in `.csproj`
- Exclude `bin/`, `obj/`, and `packages/` directories
