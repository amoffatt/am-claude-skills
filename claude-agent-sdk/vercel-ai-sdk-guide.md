# Using Claude Code with Vercel AI SDK (Subscription-Based)

## Overview

The `ai-sdk-provider-claude-code` package enables you to use Claude programmatically via the **Vercel AI SDK** while using your **Claude Pro/Max subscription** instead of requiring API keys.

This is an **unofficial community provider** that bridges:
- ✅ Your Claude Pro/Max subscription ($20-$200/month)
- ✅ The Vercel AI SDK for building applications
- ✅ Claude Code CLI's authentication system
- ✅ All of Claude's built-in tools (Bash, Read, Write, Edit, WebFetch, etc.)

**Key Advantage**: Build custom agent applications without pay-per-token API costs!

## How It Works

```
Your Claude Pro Subscription
         ↓
  Claude Code CLI (claude login)
         ↓
  ai-sdk-provider-claude-code
         ↓
    Vercel AI SDK
         ↓
  Your Node.js/TypeScript App
```

## Installation

### Step 1: Install and Authenticate Claude Code CLI

```bash
# Install Claude Code CLI globally
npm install -g @anthropic-ai/claude-code

# Authenticate with your Pro/Max subscription
claude login
```

This opens a browser window to authenticate. Once done, your credentials are saved locally.

### Step 2: Install Provider in Your Project

```bash
# For Vercel AI SDK v5 (recommended)
npm install ai-sdk-provider-claude-code ai

# For Vercel AI SDK v4
npm install ai-sdk-provider-claude-code@ai-sdk-v4 ai@^4.3.16
```

### Step 3: Optional - Zod for Schema Validation

```bash
npm install zod
```

## Basic Usage Examples

### Example 1: Simple Text Generation

```typescript
import { generateText } from 'ai';
import { claudeCode } from 'ai-sdk-provider-claude-code';

async function basicExample() {
  const result = await generateText({
    model: claudeCode('sonnet'),
    prompt: 'Explain how async/await works in JavaScript',
  });

  console.log(result.text);
}

basicExample();
```

### Example 2: Streaming Responses

```typescript
import { streamText } from 'ai';
import { claudeCode } from 'ai-sdk-provider-claude-code';

async function streamingExample() {
  const result = streamText({
    model: claudeCode('sonnet'),
    prompt: 'Write a TypeScript function to fetch data from an API',
  });

  // Stream the response
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }
}

streamingExample();
```

### Example 3: Structured Object Generation

```typescript
import { generateObject } from 'ai';
import { claudeCode } from 'ai-sdk-provider-claude-code';
import { z } from 'zod';

async function generateStructuredData() {
  const result = await generateObject({
    model: claudeCode('sonnet'),
    schema: z.object({
      name: z.string(),
      email: z.string().email(),
      age: z.number(),
      roles: z.array(z.enum(['admin', 'user', 'guest']))
    }),
    prompt: 'Generate a sample user object',
  });

  console.log(result.object);
  // { name: "John Doe", email: "john@example.com", age: 30, roles: ["user"] }
}

generateStructuredData();
```

### Example 4: Using Built-in Tools

```typescript
import { generateText } from 'ai';
import { claudeCode } from 'ai-sdk-provider-claude-code';

async function useTools() {
  const result = await generateText({
    model: claudeCode('sonnet'),
    prompt: 'Read the package.json file and tell me what dependencies are installed',
    // Claude Code automatically has access to Read, Write, Bash, etc.
  });

  console.log(result.text);
}

useTools();
```

### Example 5: System Prompts

```typescript
import { generateText } from 'ai';
import { claudeCode } from 'ai-sdk-provider-claude-code';

async function withSystemPrompt() {
  const result = await generateText({
    model: claudeCode('sonnet'),
    // Note: Use customSystemPrompt in settings
    experimental_providerMetadata: {
      claudeCode: {
        customSystemPrompt: 'You are a senior TypeScript engineer specializing in React.',
      }
    },
    prompt: 'Review this component for best practices',
  });

  console.log(result.text);
}

withSystemPrompt();
```

### Example 6: Multi-turn Conversation

```typescript
import { generateText } from 'ai';
import { claudeCode } from 'ai-sdk-provider-claude-code';

async function conversation() {
  const messages = [
    { role: 'user', content: 'What files are in this directory?' },
    { role: 'assistant', content: 'I found package.json, src/, and README.md' },
    { role: 'user', content: 'Read the package.json and summarize the project' }
  ];

  const result = await generateText({
    model: claudeCode('sonnet'),
    messages: messages as any,
  });

  console.log(result.text);
}

conversation();
```

## Available Models

```typescript
claudeCode('opus')    // Claude 4 Opus (most capable, slowest)
claudeCode('sonnet')  // Claude 4 Sonnet (balanced)
claudeCode('haiku')   // Claude 4 Haiku (fastest, cheapest on API)
```

**Note**: Model availability depends on your subscription plan:
- **Pro**: Sonnet only
- **Max**: Opus and Sonnet

## Built-in Tools

Claude Code includes these tools by default:
- **Bash** - Execute shell commands
- **Read** - Read file contents
- **Write** - Create new files
- **Edit** - Modify existing files
- **Glob** - Find files by pattern
- **Grep** - Search file contents
- **WebFetch** - Fetch and analyze web content
- **WebSearch** - Search the web
- **Task** - Delegate to subagents
- **TodoWrite** - Manage task lists

You can control which tools are available:

```typescript
import { generateText } from 'ai';
import { claudeCode } from 'ai-sdk-provider-claude-code';

const result = await generateText({
  model: claudeCode('sonnet'),
  experimental_providerMetadata: {
    claudeCode: {
      allowedTools: ['Read', 'Grep'], // Only allow reading
      // OR
      disallowedTools: ['Bash', 'Write'], // Block dangerous operations
    }
  },
  prompt: 'Analyze this codebase',
});
```

## Configuration Options

```typescript
experimental_providerMetadata: {
  claudeCode: {
    // System prompts
    customSystemPrompt?: string;
    appendSystemPrompt?: string;

    // Tool control
    allowedTools?: string[];
    disallowedTools?: string[];

    // MCP servers
    mcpServers?: string[];

    // Claude directory
    anthropicDir?: string;
  }
}
```

## Comparison: AI SDK Provider vs Claude Agent SDK

| Feature | ai-sdk-provider-claude-code | @anthropic-ai/claude-agent-sdk |
|---------|----------------------------|-------------------------------|
| **Authentication** | Pro/Max subscription (no API key) | Requires API key |
| **Cost** | Subscription ($20-$200/month) | Pay-per-token usage |
| **API Style** | Vercel AI SDK (industry standard) | Claude-specific SDK |
| **Streaming** | ✅ Full support | ✅ Full support |
| **Tools** | ✅ All Claude Code tools | ✅ Custom MCP tools |
| **Object Generation** | ✅ Native Zod support | ⚠️ Prompt engineering |
| **Framework Integration** | ✅ Works with Next.js, etc. | ⚠️ Custom integration |

## Real-World Example: Chat Application

```typescript
import { streamText } from 'ai';
import { claudeCode } from 'ai-sdk-provider-claude-code';

interface Message {
  role: 'user' | 'assistant';
  content: string;
}

class ChatAgent {
  private history: Message[] = [];

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
          customSystemPrompt: 'You are a helpful coding assistant.',
          allowedTools: ['Read', 'Grep', 'Glob', 'WebFetch']
        }
      }
    });

    let fullResponse = '';

    // Stream and collect response
    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
      fullResponse += chunk;
    }

    this.history.push({
      role: 'assistant',
      content: fullResponse
    });

    return fullResponse;
  }

  clearHistory() {
    this.history = [];
  }
}

// Usage
const agent = new ChatAgent();
await agent.chat('What TypeScript files are in src/?');
await agent.chat('Read the main one and explain what it does');
```

## Advanced: Code Review Agent

```typescript
import { generateText } from 'ai';
import { claudeCode } from 'ai-sdk-provider-claude-code';
import { z } from 'zod';

const reviewSchema = z.object({
  file: z.string(),
  issues: z.array(z.object({
    severity: z.enum(['critical', 'high', 'medium', 'low']),
    line: z.number().optional(),
    issue: z.string(),
    recommendation: z.string()
  })),
  score: z.number().min(0).max(100),
  summary: z.string()
});

async function reviewCode(filePath: string) {
  const result = await generateObject({
    model: claudeCode('sonnet'),
    schema: reviewSchema,
    experimental_providerMetadata: {
      claudeCode: {
        customSystemPrompt: `You are a senior code reviewer.
        Focus on:
        - Security vulnerabilities
        - Performance issues
        - Best practices
        - Type safety`,
        allowedTools: ['Read', 'Grep']
      }
    },
    prompt: `Review ${filePath} for code quality and security issues.
    Provide a detailed analysis with severity ratings.`
  });

  return result.object;
}

// Usage
const review = await reviewCode('src/api/auth.ts');
console.log(`Score: ${review.score}/100`);
console.log(`\nIssues found: ${review.issues.length}`);
review.issues.forEach(issue => {
  console.log(`\n[${issue.severity.toUpperCase()}] ${issue.issue}`);
  console.log(`Fix: ${issue.recommendation}`);
});
```

## Integration with Next.js

```typescript
// app/api/chat/route.ts
import { streamText } from 'ai';
import { claudeCode } from 'ai-sdk-provider-claude-code';

export async function POST(req: Request) {
  const { messages } = await req.json();

  const result = streamText({
    model: claudeCode('sonnet'),
    messages,
  });

  return result.toDataStreamResponse();
}
```

## Troubleshooting

### "Not authenticated" Error
```bash
# Re-authenticate
claude login
```

### "Model not available" Error
Check your subscription plan:
- Pro: Only has access to Sonnet
- Max: Has access to Opus and Sonnet

### Using API Key Instead of Subscription
If you have `ANTHROPIC_API_KEY` environment variable set, unset it:
```bash
unset ANTHROPIC_API_KEY
```

The provider will then use your subscription.

### Rate Limits
Remember that usage is shared between:
- Claude web/mobile app
- Claude Code CLI
- Apps using ai-sdk-provider-claude-code

Pro plan: ~10-40 prompts per 5 hours
Max 5x: ~50-200 prompts per 5 hours
Max 20x: ~200-800 prompts per 5 hours

## Best Practices

1. **Use appropriate models**: Sonnet for most tasks, Opus for complex reasoning
2. **Control tool access**: Restrict to necessary tools only
3. **Monitor usage**: Share limits with web/CLI usage
4. **Cache responses**: For repeated queries
5. **Handle streaming**: For better UX in applications
6. **Validate schemas**: Use Zod for type safety
7. **System prompts**: Set context for better results

## Resources

- **GitHub Repository**: https://github.com/ben-vargas/ai-sdk-provider-claude-code
- **Examples**: https://github.com/ben-vargas/ai-sdk-claude-code-example
- **Vercel AI SDK Docs**: https://ai-sdk.dev/providers/community-providers/claude-code
- **NPM Package**: https://www.npmjs.com/package/ai-sdk-provider-claude-code

## Summary

The `ai-sdk-provider-claude-code` package is the **best way** to build custom agent applications with your Claude Pro/Max subscription:

✅ **No API key required** - uses your subscription
✅ **Industry-standard API** - Vercel AI SDK
✅ **All Claude Code tools** - Read, Write, Bash, WebFetch, etc.
✅ **Full streaming support** - real-time responses
✅ **Type-safe schemas** - Zod integration
✅ **Framework-ready** - works with Next.js, Express, etc.

This is ideal for developers who want to build applications with Claude while staying within their monthly subscription budget rather than paying per-token API costs.
