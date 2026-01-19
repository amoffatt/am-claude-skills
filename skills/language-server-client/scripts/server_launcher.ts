#!/usr/bin/env tsx

/**
 * Language Server Launcher
 *
 * This module provides utilities for launching and configuring different language servers
 * with sensible defaults. It handles server detection, configuration, and initialization.
 *
 * Usage:
 *   import { launchLanguageServer, detectLanguageServer } from './server_launcher';
 *
 *   const config = detectLanguageServer('/path/to/project');
 *   const client = await launchLanguageServer(config);
 */

import { LSPClient, LSPClientConfig } from './lsp_client';
import * as fs from 'fs';
import * as path from 'path';
import { execSync } from 'child_process';

export interface ServerConfig {
  name: string;
  command: string;
  args: string[];
  languages: string[];
  fileExtensions: string[];
  initializationOptions?: any;
}

/**
 * Common language server configurations
 */
export const SERVER_CONFIGS: Record<string, ServerConfig> = {
  typescript: {
    name: 'TypeScript/JavaScript',
    command: 'typescript-language-server',
    args: ['--stdio'],
    languages: ['typescript', 'javascript', 'typescriptreact', 'javascriptreact'],
    fileExtensions: ['.ts', '.tsx', '.js', '.jsx', '.mjs', '.cjs'],
  },
  pyright: {
    name: 'Python (Pyright)',
    command: 'pyright-langserver',
    args: ['--stdio'],
    languages: ['python'],
    fileExtensions: ['.py', '.pyi'],
  },
  rust: {
    name: 'Rust',
    command: 'rust-analyzer',
    args: [],
    languages: ['rust'],
    fileExtensions: ['.rs'],
  },
  gopls: {
    name: 'Go',
    command: 'gopls',
    args: [],
    languages: ['go'],
    fileExtensions: ['.go'],
  },
  clangd: {
    name: 'C/C++',
    command: 'clangd',
    args: ['--background-index'],
    languages: ['c', 'cpp'],
    fileExtensions: ['.c', '.cpp', '.h', '.hpp', '.cc', '.cxx'],
  },
  jdtls: {
    name: 'Java',
    command: 'jdtls',
    args: [],
    languages: ['java'],
    fileExtensions: ['.java'],
  },
  vscode_html: {
    name: 'HTML',
    command: 'vscode-html-language-server',
    args: ['--stdio'],
    languages: ['html'],
    fileExtensions: ['.html', '.htm'],
  },
  vscode_css: {
    name: 'CSS',
    command: 'vscode-css-language-server',
    args: ['--stdio'],
    languages: ['css', 'scss', 'less'],
    fileExtensions: ['.css', '.scss', '.less', '.sass'],
  },
  vscode_json: {
    name: 'JSON',
    command: 'vscode-json-language-server',
    args: ['--stdio'],
    languages: ['json', 'jsonc'],
    fileExtensions: ['.json', '.jsonc'],
  },
  sourcekit_lsp: {
    name: 'Swift',
    command: 'sourcekit-lsp',
    args: [],
    languages: ['swift'],
    fileExtensions: ['.swift'],
  },
  omnisharp: {
    name: 'C#',
    command: 'omnisharp',
    args: ['--languageserver'],
    languages: ['csharp'],
    fileExtensions: ['.cs', '.csx'],
  },
};

/**
 * Check if a command is available in the system PATH
 */
function isCommandAvailable(command: string): boolean {
  try {
    execSync(`which ${command}`, { stdio: 'pipe' });
    return true;
  } catch {
    return false;
  }
}

/**
 * Detect the primary language of a project based on files
 */
export function detectProjectLanguage(projectPath: string): string | null {
  // Check for specific files that indicate the project type
  const indicators: Record<string, string> = {
    'package.json': 'typescript',
    'tsconfig.json': 'typescript',
    'requirements.txt': 'pyright',
    'setup.py': 'pyright',
    'Pipfile': 'pyright',
    'Cargo.toml': 'rust',
    'go.mod': 'gopls',
    'pom.xml': 'jdtls',
    'build.gradle': 'jdtls',
    'Package.swift': 'sourcekit_lsp',
    '.swiftpm': 'sourcekit_lsp',
    '*.csproj': 'omnisharp',
    '*.sln': 'omnisharp',
  };

  for (const [file, server] of Object.entries(indicators)) {
    if (fs.existsSync(path.join(projectPath, file))) {
      return server;
    }
  }

  // Count files by extension
  const extensionCounts: Record<string, number> = {};

  function countExtensions(dir: string, depth: number = 0): void {
    if (depth > 3) return; // Limit recursion depth

    try {
      const entries = fs.readdirSync(dir, { withFileTypes: true });

      for (const entry of entries) {
        if (entry.name.startsWith('.')) continue;
        if (['node_modules', 'dist', 'build', '.git'].includes(entry.name)) continue;

        const fullPath = path.join(dir, entry.name);

        if (entry.isDirectory()) {
          countExtensions(fullPath, depth + 1);
        } else if (entry.isFile()) {
          const ext = path.extname(entry.name);
          extensionCounts[ext] = (extensionCounts[ext] || 0) + 1;
        }
      }
    } catch (error) {
      // Ignore errors reading directories
    }
  }

  countExtensions(projectPath);

  // Find the server that matches the most common extension
  let maxCount = 0;
  let detectedServer: string | null = null;

  for (const [serverId, config] of Object.entries(SERVER_CONFIGS)) {
    const count = config.fileExtensions.reduce(
      (sum, ext) => sum + (extensionCounts[ext] || 0),
      0
    );

    if (count > maxCount) {
      maxCount = count;
      detectedServer = serverId;
    }
  }

  return detectedServer;
}

/**
 * Detect and configure the appropriate language server for a project
 */
export function detectLanguageServer(projectPath: string): ServerConfig | null {
  const detectedLanguage = detectProjectLanguage(projectPath);

  if (!detectedLanguage) {
    console.error('[LSP] Could not detect project language');
    return null;
  }

  const config = SERVER_CONFIGS[detectedLanguage];

  if (!config) {
    console.error(`[LSP] No configuration found for language: ${detectedLanguage}`);
    return null;
  }

  // Check if the language server is available
  if (!isCommandAvailable(config.command)) {
    console.error(`[LSP] Language server not found: ${config.command}`);
    console.error(`[LSP] Install it to use this language server`);
    return null;
  }

  return config;
}

/**
 * Launch a language server with the given configuration
 */
export async function launchLanguageServer(
  config: ServerConfig,
  projectPath: string
): Promise<LSPClient> {
  const rootUri = `file://${path.resolve(projectPath)}`;

  const clientConfig: LSPClientConfig = {
    command: config.command,
    args: config.args,
    rootUri,
    initializationOptions: config.initializationOptions,
  };

  const client = new LSPClient(clientConfig);
  await client.start();

  console.log(`[LSP] Started ${config.name} language server`);
  console.log(`[LSP] Root: ${rootUri}`);

  return client;
}

/**
 * Launch a language server with auto-detection
 */
export async function launchAutoDetected(projectPath: string): Promise<LSPClient | null> {
  const config = detectLanguageServer(projectPath);

  if (!config) {
    return null;
  }

  return launchLanguageServer(config, projectPath);
}

/**
 * Create a custom language server configuration
 */
export function createCustomConfig(
  command: string,
  args: string[],
  languages: string[],
  fileExtensions: string[],
  initializationOptions?: any
): ServerConfig {
  return {
    name: 'Custom Language Server',
    command,
    args,
    languages,
    fileExtensions,
    initializationOptions,
  };
}

/**
 * List all available language servers on the system
 */
export function listAvailableServers(): ServerConfig[] {
  return Object.values(SERVER_CONFIGS).filter((config) =>
    isCommandAvailable(config.command)
  );
}

/**
 * Get installation instructions for a language server
 */
export function getInstallationInstructions(serverId: string): string {
  const instructions: Record<string, string> = {
    typescript: 'npm install -g typescript-language-server typescript',
    pyright: 'npm install -g pyright',
    rust: 'rustup component add rust-analyzer',
    gopls: 'go install golang.org/x/tools/gopls@latest',
    clangd: 'Install via your system package manager (apt, brew, etc.)',
    jdtls: 'Download from https://download.eclipse.org/jdtls/snapshots/',
    vscode_html: 'npm install -g vscode-langservers-extracted',
    vscode_css: 'npm install -g vscode-langservers-extracted',
    vscode_json: 'npm install -g vscode-langservers-extracted',
    sourcekit_lsp: 'Included with Xcode or Swift toolchain. Download from https://swift.org/download/',
    omnisharp: 'Install via: dotnet tool install -g csharp-ls OR download from https://github.com/OmniSharp/omnisharp-roslyn/releases',
  };

  return instructions[serverId] || 'Installation instructions not available';
}
