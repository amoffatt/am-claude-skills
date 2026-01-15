---
name: claude-agent-sdk
description: Expert guidance for building AI agents with Claude using your Pro/Max subscription in TypeScript/Node.js via the Vercel AI SDK and ai-sdk-provider-claude-code. No API key required - uses claude login authentication. Covers streaming, structured outputs, conversations, tool usage, and agent patterns.
allowed-tools:
  - Read
  - Write
  - Edit
  - Glob
  - Grep
  - Bash
  - WebFetch
  - WebSearch
---

# Claude Agent SDK via Vercel AI SDK

Build AI agents with **Claude using your Pro/Max subscription** (no API key required) through the Vercel AI SDK.

## Key Benefits

✅ **No API key needed** - authenticate via `claude login`
✅ **Fixed monthly cost** - $20-$200/month (not pay-per-token)
✅ **Industry-standard API** - Vercel AI SDK
✅ **All Claude tools** - Read, Write, Bash, WebFetch, etc.
✅ **Type-safe schemas** - Zod integration for structured outputs

## Quick Start

### Installation
```bash
# Install and authenticate Claude Code CLI
npm install -g @anthropic-ai/claude-code
claude login

# Install in your project
npm install ai-sdk-provider-claude-code ai zod
```

### Basic Usage
```typescript
import { generateText } from 'ai';
import { claudeCode } from 'ai-sdk-provider-claude-code';

const result = await generateText({
  model: claudeCode('sonnet'),
  prompt: 'Explain async/await in JavaScript',
});

console.log(result.text);
```

## Core Patterns

### 1. Streaming Responses
```typescript
import { streamText } from 'ai';
import { claudeCode } from 'ai-sdk-provider-claude-code';

const result = streamText({
  model: claudeCode('sonnet'),
  prompt: 'Write a TypeScript function',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

### 2. Structured Outputs
```typescript
import { generateObject } from 'ai';
import { z } from 'zod';

const result = await generateObject({
  model: claudeCode('sonnet'),
  schema: z.object({
    name: z.string(),
    email: z.string().email(),
    age: z.number()
  }),
  prompt: 'Generate a user object',
});

console.log(result.object); // Type-safe!
```

### 3. Using Claude's Built-in Tools
```typescript
const result = await generateText({
  model: claudeCode('sonnet'),
  prompt: 'Read package.json and summarize this project',
  // Claude automatically uses Read tool
});
```

Available tools: Read, Write, Edit, Bash, Grep, Glob, WebFetch, WebSearch

### 4. Tool Control
```typescript
const result = await generateText({
  model: claudeCode('sonnet'),
  experimental_providerMetadata: {
    claudeCode: {
      allowedTools: ['Read', 'Grep', 'Glob'], // Limit to safe operations
    }
  },
  prompt: 'Analyze this codebase',
});
```

### 5. System Prompts
```typescript
const result = await generateText({
  model: claudeCode('sonnet'),
  experimental_providerMetadata: {
    claudeCode: {
      customSystemPrompt: 'You are a senior TypeScript engineer.',
    }
  },
  prompt: 'Review this code',
});
```

### 6. Multi-turn Conversations
```typescript
const messages = [
  { role: 'user', content: 'List TypeScript files' },
  { role: 'assistant', content: 'Found: index.ts, app.ts' },
  { role: 'user', content: 'Read index.ts' }
];

const result = await generateText({
  model: claudeCode('sonnet'),
  messages: messages as any,
});
```

## Complete Agent Example

```typescript
import { generateObject, generateText } from 'ai';
import { claudeCode } from 'ai-sdk-provider-claude-code';
import { z } from 'zod';

class CodingAgent {
  async analyzeCode(filePath: string) {
    const schema = z.object({
      summary: z.string(),
      complexity: z.enum(['low', 'medium', 'high']),
      issues: z.array(z.object({
        severity: z.enum(['critical', 'high', 'medium', 'low']),
        message: z.string(),
      })),
      score: z.number().min(0).max(100)
    });

    return await generateObject({
      model: claudeCode('sonnet'),
      schema,
      experimental_providerMetadata: {
        claudeCode: {
          customSystemPrompt: 'You are a code reviewer.',
          allowedTools: ['Read', 'Grep']
        }
      },
      prompt: `Analyze ${filePath} for quality and security.`
    });
  }

  async chat(userMessage: string) {
    const result = streamText({
      model: claudeCode('sonnet'),
      prompt: userMessage,
    });

    for await (const chunk of result.textStream) {
      process.stdout.write(chunk);
    }
  }
}
```

## Available Models

```typescript
claudeCode('opus')    // Claude 4 Opus (Max subscription only)
claudeCode('sonnet')  // Claude 4 Sonnet (Pro and Max)
claudeCode('haiku')   // Claude 4 Haiku (Pro and Max)
```

## Usage Limits

Shared with Claude web/mobile and CLI:
- **Pro** ($20/mo): ~10-40 prompts per 5 hours
- **Max 5x** ($100/mo): ~50-200 prompts per 5 hours
- **Max 20x** ($200/mo): ~200-800 prompts per 5 hours

## Important Notes

1. **Authentication**: Run `claude login` once, then your subscription is used automatically
2. **No API key**: If you have `ANTHROPIC_API_KEY` set, unset it to use your subscription
3. **Model access**: Pro has Sonnet only; Max has Opus and Sonnet
4. **Examples**: See `examples/` directory for complete working examples

## Resources

- **Provider Repo**: https://github.com/ben-vargas/ai-sdk-provider-claude-code
- **Documentation**: https://ai-sdk.dev/providers/community-providers/claude-code
- **Vercel AI SDK**: https://ai-sdk.dev
- **Examples**: See `vercel-ai-sdk-guide.md` and `examples/`
