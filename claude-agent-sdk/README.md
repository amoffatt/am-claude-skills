# Claude Agent SDK Skill (Vercel AI SDK)

Build AI agents with Claude using your **Pro/Max subscription** (no API key required) via the Vercel AI SDK.

## What This Skill Covers

Expert guidance for using `ai-sdk-provider-claude-code` with the Vercel AI SDK to build Claude-powered applications in TypeScript/Node.js.

## Key Benefits

✅ No API key required - uses `claude login` authentication
✅ Fixed monthly cost ($20-$200) vs pay-per-token
✅ Industry-standard Vercel AI SDK
✅ All Claude Code tools (Read, Write, Bash, WebFetch, etc.)
✅ Type-safe structured outputs with Zod

## Quick Start

```bash
# Install and authenticate
npm install -g @anthropic-ai/claude-code
claude login

# Install in your project
npm install ai-sdk-provider-claude-code ai zod
```

```typescript
import { generateText } from 'ai';
import { claudeCode } from 'ai-sdk-provider-claude-code';

const result = await generateText({
  model: claudeCode('sonnet'),
  prompt: 'Explain async/await',
});

console.log(result.text);
```

## What's Included

- **SKILL.md** - Main skill with core patterns and examples
- **vercel-ai-sdk-guide.md** - Comprehensive guide with advanced patterns
- **examples/** - 3 working TypeScript examples:
  - `vercel-ai-basic.ts` - Basic usage, streaming, conversations
  - `vercel-ai-structured.ts` - Structured outputs with Zod (7 examples)
  - `vercel-ai-agent.ts` - Complete agent with code analysis

## Core Features

### Streaming
```typescript
const result = streamText({
  model: claudeCode('sonnet'),
  prompt: 'Write code',
});

for await (const chunk of result.textStream) {
  process.stdout.write(chunk);
}
```

### Structured Outputs
```typescript
const result = await generateObject({
  model: claudeCode('sonnet'),
  schema: z.object({ name: z.string() }),
  prompt: 'Generate user',
});
```

### Tool Control
```typescript
experimental_providerMetadata: {
  claudeCode: {
    allowedTools: ['Read', 'Grep'],
    customSystemPrompt: 'You are a code reviewer'
  }
}
```

## When This Skill Activates

Claude will use this skill when you:
- Ask about building agents with your Claude subscription
- Need to use Claude programmatically in TypeScript/Node.js
- Want to integrate Claude with Vercel AI SDK
- Request structured outputs or streaming
- Need help with ai-sdk-provider-claude-code

## Requirements

- Node.js 18+
- Claude Pro or Max subscription
- TypeScript (recommended)

## Usage Limits

Shared with Claude web/mobile:
- Pro: ~10-40 prompts per 5 hours
- Max 5x: ~50-200 prompts per 5 hours
- Max 20x: ~200-800 prompts per 5 hours

## Resources

- [Provider GitHub](https://github.com/ben-vargas/ai-sdk-provider-claude-code)
- [Documentation](https://ai-sdk.dev/providers/community-providers/claude-code)
- [Vercel AI SDK](https://ai-sdk.dev)

---

**Note**: This is a community provider (not official Anthropic). For API-based development with pay-per-token billing, use `@anthropic-ai/claude-agent-sdk` instead.
