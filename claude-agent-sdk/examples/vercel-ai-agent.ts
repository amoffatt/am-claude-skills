/**
 * Vercel AI SDK - Complete Agent Implementation
 *
 * This example shows how to build a complete coding agent using
 * ai-sdk-provider-claude-code with conversation history, tool control,
 * and system prompts.
 */

import { streamText, generateText, generateObject } from 'ai';
import { claudeCode } from 'ai-sdk-provider-claude-code';
import { z } from 'zod';
import * as readline from 'readline';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

class CodingAgent {
  private history: Message[] = [];
  private systemPrompt: string;
  private allowedTools: string[];

  constructor(config?: {
    systemPrompt?: string;
    allowedTools?: string[];
  }) {
    this.systemPrompt = config?.systemPrompt || `You are an expert software engineer.
    You help users write, review, and debug code.
    You can read files, search codebases, and provide detailed technical guidance.`;

    this.allowedTools = config?.allowedTools || [
      'Read', 'Write', 'Edit', 'Grep', 'Glob', 'Bash', 'WebFetch'
    ];
  }

  async chat(userMessage: string): Promise<string> {
    this.history.push({
      role: 'user',
      content: userMessage
    });

    const result = streamText({
      model: claudeCode('sonnet'),
      messages: this.history as any,
      experimental_providerMetadata: {
        claudeCode: {
          customSystemPrompt: this.systemPrompt,
          allowedTools: this.allowedTools
        }
      }
    });

    let fullResponse = '';

    // Stream the response
    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
      fullResponse += chunk;
    }

    console.log('\n');

    this.history.push({
      role: 'assistant',
      content: fullResponse
    });

    return fullResponse;
  }

  async analyzeCode(filePath: string) {
    const schema = z.object({
      file: z.string(),
      summary: z.string(),
      complexity: z.enum(['low', 'medium', 'high']),
      issues: z.array(z.object({
        severity: z.enum(['critical', 'high', 'medium', 'low']),
        type: z.string(),
        message: z.string(),
        line: z.number().optional()
      })),
      suggestions: z.array(z.string()),
      score: z.number().min(0).max(100)
    });

    const result = await generateObject({
      model: claudeCode('sonnet'),
      schema,
      experimental_providerMetadata: {
        claudeCode: {
          customSystemPrompt: `You are a code reviewer focusing on:
          - Security vulnerabilities
          - Performance issues
          - Best practices
          - Code quality`,
          allowedTools: ['Read', 'Grep']
        }
      },
      prompt: `Analyze ${filePath} and provide a detailed code review.`
    });

    return result.object;
  }

  async generateTests(sourceFile: string) {
    const schema = z.object({
      source_file: z.string(),
      test_file: z.string(),
      framework: z.string(),
      test_cases: z.array(z.object({
        name: z.string(),
        description: z.string(),
        code: z.string(),
        type: z.enum(['unit', 'integration', 'edge-case'])
      }))
    });

    const result = await generateObject({
      model: claudeCode('sonnet'),
      schema,
      experimental_providerMetadata: {
        claudeCode: {
          customSystemPrompt: 'Generate comprehensive test cases using Jest/Vitest.',
          allowedTools: ['Read', 'Grep']
        }
      },
      prompt: `Read ${sourceFile} and generate comprehensive test cases.`
    });

    return result.object;
  }

  async refactorCode(filePath: string, instructions: string) {
    const result = await generateText({
      model: claudeCode('sonnet'),
      experimental_providerMetadata: {
        claudeCode: {
          customSystemPrompt: `You are a refactoring specialist.
          - Preserve functionality exactly
          - Improve code quality and readability
          - Follow best practices
          - Add TypeScript types where missing`,
          allowedTools: ['Read', 'Edit', 'Bash']
        }
      },
      prompt: `Refactor ${filePath} according to these instructions: ${instructions}`
    });

    return result.text;
  }

  async explainCode(filePath: string) {
    const schema = z.object({
      file: z.string(),
      purpose: z.string(),
      main_components: z.array(z.object({
        name: z.string(),
        type: z.enum(['function', 'class', 'interface', 'type', 'constant']),
        description: z.string(),
        parameters: z.array(z.string()).optional(),
        returns: z.string().optional()
      })),
      dependencies: z.array(z.string()),
      complexity: z.enum(['simple', 'moderate', 'complex']),
      key_concepts: z.array(z.string()),
      suggestions: z.array(z.string()).optional()
    });

    const result = await generateObject({
      model: claudeCode('sonnet'),
      schema,
      experimental_providerMetadata: {
        claudeCode: {
          allowedTools: ['Read', 'Grep']
        }
      },
      prompt: `Read and explain ${filePath} in detail.`
    });

    return result.object;
  }

  async searchCodebase(query: string) {
    const result = await generateText({
      model: claudeCode('sonnet'),
      experimental_providerMetadata: {
        claudeCode: {
          allowedTools: ['Grep', 'Glob', 'Read']
        }
      },
      prompt: `Search the codebase for: ${query}

      Use Grep to find relevant files, then provide:
      1. List of files containing the query
      2. Context around each match
      3. Summary of findings`
    });

    return result.text;
  }

  clearHistory() {
    this.history = [];
  }

  getHistoryLength(): number {
    return this.history.length;
  }
}

// Interactive CLI
async function interactiveCLI() {
  const agent = new CodingAgent();
  const rl = readline.createInterface({
    input: process.stdin,
    output: process.stdout
  });

  console.log('=== Coding Agent (Claude Pro/Max) ===');
  console.log('Commands:');
  console.log('  /analyze <file>  - Analyze code quality');
  console.log('  /test <file>     - Generate test cases');
  console.log('  /explain <file>  - Explain code');
  console.log('  /search <query>  - Search codebase');
  console.log('  /clear           - Clear history');
  console.log('  /exit            - Exit\n');

  const askQuestion = () => {
    rl.question('You: ', async (input) => {
      const trimmed = input.trim();

      if (trimmed === '/exit') {
        console.log('Goodbye!');
        rl.close();
        return;
      }

      if (trimmed === '/clear') {
        agent.clearHistory();
        console.log('History cleared.\n');
        askQuestion();
        return;
      }

      if (trimmed.startsWith('/analyze ')) {
        const file = trimmed.slice(9);
        console.log(`\nAnalyzing ${file}...\n`);
        try {
          const analysis = await agent.analyzeCode(file);
          console.log('Analysis Result:');
          console.log(JSON.stringify(analysis, null, 2));
        } catch (error) {
          console.error('Error:', error.message);
        }
        console.log();
        askQuestion();
        return;
      }

      if (trimmed.startsWith('/test ')) {
        const file = trimmed.slice(6);
        console.log(`\nGenerating tests for ${file}...\n`);
        try {
          const tests = await agent.generateTests(file);
          console.log('Generated Tests:');
          console.log(JSON.stringify(tests, null, 2));
        } catch (error) {
          console.error('Error:', error.message);
        }
        console.log();
        askQuestion();
        return;
      }

      if (trimmed.startsWith('/explain ')) {
        const file = trimmed.slice(9);
        console.log(`\nExplaining ${file}...\n`);
        try {
          const explanation = await agent.explainCode(file);
          console.log('Explanation:');
          console.log(JSON.stringify(explanation, null, 2));
        } catch (error) {
          console.error('Error:', error.message);
        }
        console.log();
        askQuestion();
        return;
      }

      if (trimmed.startsWith('/search ')) {
        const query = trimmed.slice(8);
        console.log(`\nSearching for: ${query}...\n`);
        try {
          const results = await agent.searchCodebase(query);
          console.log(results);
        } catch (error) {
          console.error('Error:', error.message);
        }
        console.log();
        askQuestion();
        return;
      }

      if (!trimmed) {
        askQuestion();
        return;
      }

      try {
        console.log('\nAgent: ');
        await agent.chat(trimmed);
      } catch (error) {
        console.error('Error:', error.message);
      }

      askQuestion();
    });
  };

  askQuestion();
}

// Programmatic example
async function programmaticExample() {
  console.log('=== Programmatic Agent Example ===\n');

  const agent = new CodingAgent({
    systemPrompt: 'You are a TypeScript expert specializing in React.',
    allowedTools: ['Read', 'Grep', 'Glob']
  });

  // Example workflow: Analyze, explain, suggest improvements
  console.log('Step 1: Search for React components\n');
  const searchResults = await agent.searchCodebase('React.FC');
  console.log(searchResults);

  console.log('\n\nStep 2: Analyze a component\n');
  // Uncomment and provide actual file:
  // const analysis = await agent.analyzeCode('src/components/Button.tsx');
  // console.log(JSON.stringify(analysis, null, 2));

  console.log('\n\nStep 3: Chat for suggestions\n');
  console.log('Agent: ');
  await agent.chat('Based on what you found, suggest 3 improvements for the codebase');
}

// Run examples
async function main() {
  const args = process.argv.slice(2);

  if (args.includes('--interactive')) {
    await interactiveCLI();
  } else {
    await programmaticExample();
  }
}

main().catch(console.error);
