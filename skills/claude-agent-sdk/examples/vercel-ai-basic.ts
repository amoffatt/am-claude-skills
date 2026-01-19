/**
 * Vercel AI SDK with Claude Code - Basic Example
 *
 * This example shows how to use Claude with your Pro/Max subscription
 * via the ai-sdk-provider-claude-code package.
 *
 * Prerequisites:
 * 1. npm install -g @anthropic-ai/claude-code
 * 2. claude login
 * 3. npm install ai-sdk-provider-claude-code ai
 */

import { generateText, streamText } from 'ai';
import { claudeCode } from 'ai-sdk-provider-claude-code';

// Example 1: Simple text generation
async function basicGeneration() {
  console.log('=== Basic Text Generation ===\n');

  const result = await generateText({
    model: claudeCode('sonnet'),
    prompt: 'Explain the difference between const, let, and var in JavaScript',
  });

  console.log(result.text);
  console.log('\n--- Metadata ---');
  console.log('Usage:', result.usage);
  console.log('Finish reason:', result.finishReason);
}

// Example 2: Streaming response
async function streamingResponse() {
  console.log('\n=== Streaming Response ===\n');

  const result = streamText({
    model: claudeCode('sonnet'),
    prompt: 'Write a TypeScript function that debounces another function',
  });

  console.log('Response: ');

  // Stream chunks as they arrive
  for await (const chunk of result.textStream) {
    process.stdout.write(chunk);
  }

  console.log('\n\n[Stream complete]');
}

// Example 3: Using Claude's built-in tools
async function withTools() {
  console.log('\n=== Using Built-in Tools ===\n');

  const result = await generateText({
    model: claudeCode('sonnet'),
    prompt: 'Read the package.json file in the current directory and tell me what the project is about',
  });

  console.log(result.text);
}

// Example 4: Multi-turn conversation
async function conversation() {
  console.log('\n=== Multi-turn Conversation ===\n');

  // First turn
  const turn1 = await generateText({
    model: claudeCode('sonnet'),
    prompt: 'List all .ts files in the current directory',
  });

  console.log('Turn 1:', turn1.text);

  // Second turn - references first
  const turn2 = await generateText({
    model: claudeCode('sonnet'),
    messages: [
      { role: 'user', content: 'List all .ts files in the current directory' },
      { role: 'assistant', content: turn1.text },
      { role: 'user', content: 'Now read the first file you found and summarize it' }
    ] as any,
  });

  console.log('\nTurn 2:', turn2.text);
}

// Example 5: Different models
async function compareModels() {
  console.log('\n=== Model Comparison ===\n');

  const prompt = 'Write a one-sentence explanation of recursion';

  // Note: Model availability depends on your subscription
  // Pro: sonnet only
  // Max: sonnet and opus

  const sonnetResult = await generateText({
    model: claudeCode('sonnet'),
    prompt,
  });

  console.log('Sonnet:', sonnetResult.text);

  // Uncomment if you have Max subscription:
  // const opusResult = await generateText({
  //   model: claudeCode('opus'),
  //   prompt,
  // });
  // console.log('\nOpus:', opusResult.text);
}

// Run all examples
async function main() {
  try {
    await basicGeneration();
    await streamingResponse();
    await withTools();
    await conversation();
    await compareModels();
  } catch (error) {
    console.error('Error:', error.message);

    if (error.message.includes('authentication')) {
      console.log('\nPlease run: claude login');
    }
  }
}

main();
