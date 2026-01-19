/**
 * Vercel AI SDK - Structured Object Generation
 *
 * Demonstrates generating type-safe structured data using Zod schemas.
 *
 * Prerequisites:
 * npm install ai-sdk-provider-claude-code ai zod
 */

import { generateObject, streamObject } from 'ai';
import { claudeCode } from 'ai-sdk-provider-claude-code';
import { z } from 'zod';

// Example 1: Simple object generation
async function simpleObject() {
  console.log('=== Simple Object Generation ===\n');

  const userSchema = z.object({
    name: z.string(),
    email: z.string().email(),
    age: z.number().min(0).max(120),
    role: z.enum(['admin', 'user', 'guest'])
  });

  const result = await generateObject({
    model: claudeCode('sonnet'),
    schema: userSchema,
    prompt: 'Generate a sample user object for a software engineer named Alex',
  });

  console.log('Generated user:');
  console.log(result.object);
}

// Example 2: Complex nested schema
async function complexObject() {
  console.log('\n=== Complex Nested Object ===\n');

  const projectSchema = z.object({
    name: z.string(),
    description: z.string(),
    tech_stack: z.array(z.string()),
    team: z.array(z.object({
      name: z.string(),
      role: z.string(),
      expertise: z.array(z.string())
    })),
    timeline: z.object({
      start_date: z.string(),
      end_date: z.string(),
      milestones: z.array(z.object({
        title: z.string(),
        date: z.string(),
        status: z.enum(['pending', 'in-progress', 'completed'])
      }))
    }),
    budget: z.object({
      total: z.number(),
      spent: z.number(),
      currency: z.string()
    })
  });

  const result = await generateObject({
    model: claudeCode('sonnet'),
    schema: projectSchema,
    prompt: 'Generate a project plan for building a real-time chat application',
  });

  console.log('Project plan:');
  console.log(JSON.stringify(result.object, null, 2));
}

// Example 3: Code analysis result
async function codeAnalysis() {
  console.log('\n=== Code Analysis Object ===\n');

  const analysisSchema = z.object({
    file: z.string(),
    language: z.string(),
    loc: z.number().describe('Lines of code'),
    complexity: z.enum(['low', 'medium', 'high']),
    issues: z.array(z.object({
      severity: z.enum(['critical', 'high', 'medium', 'low', 'info']),
      line: z.number().optional(),
      type: z.enum(['security', 'performance', 'style', 'bug', 'best-practice']),
      message: z.string(),
      suggestion: z.string()
    })),
    metrics: z.object({
      cyclomatic_complexity: z.number(),
      maintainability_index: z.number().min(0).max(100),
      test_coverage: z.number().min(0).max(100).optional()
    }),
    dependencies: z.array(z.string()),
    exports: z.array(z.string())
  });

  const result = await generateObject({
    model: claudeCode('sonnet'),
    schema: analysisSchema,
    prompt: `Analyze the package.json file in the current directory.
    Read the file and provide a detailed analysis.`,
    experimental_providerMetadata: {
      claudeCode: {
        allowedTools: ['Read', 'Grep']
      }
    }
  });

  console.log('Analysis result:');
  console.log(JSON.stringify(result.object, null, 2));
}

// Example 4: Streaming object generation
async function streamingObject() {
  console.log('\n=== Streaming Object Generation ===\n');

  const todoListSchema = z.object({
    title: z.string(),
    todos: z.array(z.object({
      id: z.number(),
      task: z.string(),
      priority: z.enum(['low', 'medium', 'high']),
      estimated_hours: z.number(),
      completed: z.boolean()
    })),
    total_estimated_hours: z.number()
  });

  const result = streamObject({
    model: claudeCode('sonnet'),
    schema: todoListSchema,
    prompt: 'Create a todo list for building a REST API with authentication',
  });

  console.log('Streaming object parts:');

  // Stream partial objects
  for await (const part of result.partialObjectStream) {
    console.clear();
    console.log('Current state:');
    console.log(JSON.stringify(part, null, 2));
    await new Promise(resolve => setTimeout(resolve, 100));
  }

  console.log('\n\nFinal object:');
  console.log(JSON.stringify(await result.object, null, 2));
}

// Example 5: API response schema
async function apiResponseSchema() {
  console.log('\n=== API Response Schema ===\n');

  const apiSchema = z.object({
    status: z.enum(['success', 'error']),
    data: z.object({
      users: z.array(z.object({
        id: z.string().uuid(),
        username: z.string(),
        email: z.string().email(),
        created_at: z.string().datetime(),
        last_login: z.string().datetime().optional()
      })),
      pagination: z.object({
        page: z.number().int().positive(),
        per_page: z.number().int().positive(),
        total: z.number().int().nonnegative(),
        total_pages: z.number().int().nonnegative()
      })
    }).optional(),
    error: z.object({
      code: z.string(),
      message: z.string(),
      details: z.record(z.any()).optional()
    }).optional(),
    metadata: z.object({
      request_id: z.string(),
      timestamp: z.string().datetime(),
      version: z.string()
    })
  });

  const result = await generateObject({
    model: claudeCode('sonnet'),
    schema: apiSchema,
    prompt: 'Generate a sample successful API response for fetching users (page 1, 10 users)',
  });

  console.log('API Response:');
  console.log(JSON.stringify(result.object, null, 2));
}

// Example 6: Test case generation
async function testCaseGeneration() {
  console.log('\n=== Test Case Generation ===\n');

  const testSuiteSchema = z.object({
    function_name: z.string(),
    description: z.string(),
    test_cases: z.array(z.object({
      name: z.string(),
      description: z.string(),
      input: z.any(),
      expected_output: z.any(),
      edge_case: z.boolean(),
      should_throw: z.boolean()
    }))
  });

  const result = await generateObject({
    model: claudeCode('sonnet'),
    schema: testSuiteSchema,
    prompt: `Generate comprehensive test cases for a function that validates email addresses.
    Include normal cases, edge cases, and error cases.`,
  });

  console.log('Test Suite:');
  console.log(JSON.stringify(result.object, null, 2));
}

// Example 7: Configuration file generation
async function configGeneration() {
  console.log('\n=== Configuration Generation ===\n');

  const configSchema = z.object({
    app_name: z.string(),
    environment: z.enum(['development', 'staging', 'production']),
    server: z.object({
      host: z.string(),
      port: z.number().int().min(1).max(65535),
      ssl: z.boolean(),
      cors: z.object({
        enabled: z.boolean(),
        origins: z.array(z.string().url())
      })
    }),
    database: z.object({
      type: z.enum(['postgres', 'mysql', 'mongodb', 'sqlite']),
      host: z.string(),
      port: z.number().int(),
      name: z.string(),
      pool_size: z.number().int().min(1).max(100)
    }),
    logging: z.object({
      level: z.enum(['debug', 'info', 'warn', 'error']),
      format: z.enum(['json', 'text']),
      outputs: z.array(z.enum(['console', 'file', 'syslog']))
    }),
    features: z.object({
      authentication: z.boolean(),
      rate_limiting: z.boolean(),
      caching: z.boolean(),
      monitoring: z.boolean()
    })
  });

  const result = await generateObject({
    model: claudeCode('sonnet'),
    schema: configSchema,
    prompt: 'Generate a production-ready configuration for a Node.js API server',
  });

  console.log('Configuration:');
  console.log(JSON.stringify(result.object, null, 2));
}

// Run all examples
async function main() {
  try {
    await simpleObject();
    await complexObject();
    await codeAnalysis();
    await streamingObject();
    await apiResponseSchema();
    await testCaseGeneration();
    await configGeneration();
  } catch (error) {
    console.error('Error:', error.message);

    if (error.message.includes('authentication')) {
      console.log('\nPlease run: claude login');
    }
  }
}

main();
