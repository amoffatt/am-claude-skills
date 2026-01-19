#!/usr/bin/env tsx

/**
 * Core LSP Client Implementation
 *
 * This module provides a TypeScript implementation of a Language Server Protocol (LSP) client
 * that can connect to and communicate with any LSP-compliant language server.
 *
 * Usage:
 *   import { LSPClient } from './lsp_client';
 *
 *   const client = new LSPClient({
 *     command: 'typescript-language-server',
 *     args: ['--stdio'],
 *     rootUri: 'file:///path/to/project'
 *   });
 *
 *   await client.start();
 *   const result = await client.gotoDefinition('file:///path/to/file.ts', { line: 10, character: 5 });
 *   await client.shutdown();
 */

import { spawn, ChildProcess } from 'child_process';
import { EventEmitter } from 'events';

export interface Position {
  line: number;
  character: number;
}

export interface Range {
  start: Position;
  end: Position;
}

export interface Location {
  uri: string;
  range: Range;
}

export interface Diagnostic {
  range: Range;
  severity: number;
  code?: string | number;
  source?: string;
  message: string;
}

export interface LSPClientConfig {
  command: string;
  args: string[];
  rootUri: string;
  workspaceFolders?: Array<{ uri: string; name: string }>;
  initializationOptions?: any;
}

export class LSPClient extends EventEmitter {
  private process: ChildProcess | null = null;
  private messageBuffer: string = '';
  private nextRequestId: number = 1;
  private pendingRequests: Map<number, { resolve: Function; reject: Function }> = new Map();
  private initialized: boolean = false;
  private config: LSPClientConfig;

  constructor(config: LSPClientConfig) {
    super();
    this.config = config;
  }

  /**
   * Start the language server and initialize the connection
   */
  async start(): Promise<void> {
    return new Promise((resolve, reject) => {
      this.process = spawn(this.config.command, this.config.args, {
        stdio: ['pipe', 'pipe', 'pipe'],
      });

      if (!this.process.stdout || !this.process.stdin || !this.process.stderr) {
        reject(new Error('Failed to create language server process streams'));
        return;
      }

      this.process.stdout.on('data', (data: Buffer) => {
        this.handleData(data);
      });

      this.process.stderr.on('data', (data: Buffer) => {
        console.error('[LSP Server Error]:', data.toString());
      });

      this.process.on('error', (err) => {
        reject(err);
      });

      this.process.on('exit', (code) => {
        console.log(`[LSP] Language server exited with code ${code}`);
        this.emit('exit', code);
      });

      // Initialize the language server
      this.initialize()
        .then(() => {
          this.initialized = true;
          resolve();
        })
        .catch(reject);
    });
  }

  /**
   * Send the initialize request to the language server
   */
  private async initialize(): Promise<any> {
    const initializeParams = {
      processId: process.pid,
      rootUri: this.config.rootUri,
      workspaceFolders: this.config.workspaceFolders || [
        { uri: this.config.rootUri, name: 'workspace' },
      ],
      capabilities: {
        textDocument: {
          synchronization: {
            didSave: true,
            didOpen: true,
            didClose: true,
            didChange: true,
          },
          completion: { completionItem: { snippetSupport: true } },
          hover: { contentFormat: ['markdown', 'plaintext'] },
          definition: { linkSupport: true },
          references: {},
          documentSymbol: {},
          codeAction: {},
          formatting: {},
          rename: {},
        },
        workspace: {
          applyEdit: true,
          workspaceFolders: true,
        },
      },
      initializationOptions: this.config.initializationOptions || {},
    };

    const result = await this.sendRequest('initialize', initializeParams);
    await this.sendNotification('initialized', {});
    return result;
  }

  /**
   * Handle incoming data from the language server
   */
  private handleData(data: Buffer): void {
    this.messageBuffer += data.toString();

    while (true) {
      const headerEnd = this.messageBuffer.indexOf('\r\n\r\n');
      if (headerEnd === -1) break;

      const headers = this.messageBuffer.substring(0, headerEnd);
      const contentLengthMatch = headers.match(/Content-Length: (\d+)/i);

      if (!contentLengthMatch) {
        console.error('[LSP] Invalid message: no Content-Length header');
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
        const message = JSON.parse(messageContent);
        this.handleMessage(message);
      } catch (error) {
        console.error('[LSP] Failed to parse message:', error);
      }
    }
  }

  /**
   * Handle a parsed message from the language server
   */
  private handleMessage(message: any): void {
    if (message.id !== undefined) {
      // Response to a request
      const pending = this.pendingRequests.get(message.id);
      if (pending) {
        this.pendingRequests.delete(message.id);
        if (message.error) {
          pending.reject(new Error(message.error.message));
        } else {
          pending.resolve(message.result);
        }
      }
    } else if (message.method) {
      // Notification from server
      this.emit('notification', message.method, message.params);
    }
  }

  /**
   * Send a request to the language server
   */
  private async sendRequest(method: string, params: any): Promise<any> {
    if (!this.process || !this.process.stdin) {
      throw new Error('Language server not started');
    }

    const id = this.nextRequestId++;
    const message = {
      jsonrpc: '2.0',
      id,
      method,
      params,
    };

    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content, 'utf8')}\r\n\r\n`;
    const data = header + content;

    this.process.stdin.write(data);

    return new Promise((resolve, reject) => {
      this.pendingRequests.set(id, { resolve, reject });
    });
  }

  /**
   * Send a notification to the language server
   */
  private async sendNotification(method: string, params: any): Promise<void> {
    if (!this.process || !this.process.stdin) {
      throw new Error('Language server not started');
    }

    const message = {
      jsonrpc: '2.0',
      method,
      params,
    };

    const content = JSON.stringify(message);
    const header = `Content-Length: ${Buffer.byteLength(content, 'utf8')}\r\n\r\n`;
    const data = header + content;

    this.process.stdin.write(data);
  }

  /**
   * Open a document in the language server
   */
  async openDocument(uri: string, languageId: string, version: number, text: string): Promise<void> {
    await this.sendNotification('textDocument/didOpen', {
      textDocument: {
        uri,
        languageId,
        version,
        text,
      },
    });
  }

  /**
   * Close a document in the language server
   */
  async closeDocument(uri: string): Promise<void> {
    await this.sendNotification('textDocument/didClose', {
      textDocument: { uri },
    });
  }

  /**
   * Get the definition of a symbol at a given position
   */
  async gotoDefinition(uri: string, position: Position): Promise<Location | Location[] | null> {
    return this.sendRequest('textDocument/definition', {
      textDocument: { uri },
      position,
    });
  }

  /**
   * Find all references to a symbol at a given position
   */
  async findReferences(uri: string, position: Position, includeDeclaration: boolean = true): Promise<Location[]> {
    return this.sendRequest('textDocument/references', {
      textDocument: { uri },
      position,
      context: { includeDeclaration },
    });
  }

  /**
   * Get hover information for a symbol at a given position
   */
  async hover(uri: string, position: Position): Promise<any> {
    return this.sendRequest('textDocument/hover', {
      textDocument: { uri },
      position,
    });
  }

  /**
   * Get completion suggestions at a given position
   */
  async completion(uri: string, position: Position): Promise<any> {
    return this.sendRequest('textDocument/completion', {
      textDocument: { uri },
      position,
    });
  }

  /**
   * Get diagnostics for a document
   */
  async getDiagnostics(uri: string): Promise<Diagnostic[]> {
    // Diagnostics are typically sent as notifications from the server
    // This method listens for diagnostic notifications
    return new Promise((resolve) => {
      const handler = (method: string, params: any) => {
        if (method === 'textDocument/publishDiagnostics' && params.uri === uri) {
          this.off('notification', handler);
          resolve(params.diagnostics);
        }
      };
      this.on('notification', handler);
    });
  }

  /**
   * Rename a symbol at a given position
   */
  async rename(uri: string, position: Position, newName: string): Promise<any> {
    return this.sendRequest('textDocument/rename', {
      textDocument: { uri },
      position,
      newName,
    });
  }

  /**
   * Format a document
   */
  async format(uri: string, options: { tabSize: number; insertSpaces: boolean }): Promise<any> {
    return this.sendRequest('textDocument/formatting', {
      textDocument: { uri },
      options,
    });
  }

  /**
   * Get document symbols
   */
  async documentSymbols(uri: string): Promise<any> {
    return this.sendRequest('textDocument/documentSymbol', {
      textDocument: { uri },
    });
  }

  /**
   * Shutdown the language server
   */
  async shutdown(): Promise<void> {
    if (!this.initialized) return;

    await this.sendRequest('shutdown', {});
    await this.sendNotification('exit', {});

    if (this.process) {
      this.process.kill();
      this.process = null;
    }

    this.initialized = false;
  }
}
