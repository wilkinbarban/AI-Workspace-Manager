import { z } from 'zod'

export const projectIdSchema = z.string().min(1)

export const askProjectSchema = z.object({
  projectId: projectIdSchema,
  message: z.string().min(1).max(8000),
  providerId: z.string().optional(),
  taskType: z
    .enum(['analysis', 'code-generation', 'documentation', 'refactor', 'agent', 'bug-review', 'test-generation', 'upgrade'])
    .default('analysis')
})

export const createTaskSchema = z.object({
  projectId: projectIdSchema,
  input: z.object({
    title: z.string().min(1).max(220),
    description: z.string().max(2000).optional()
  })
})

export const saveAIProviderSchema = z.object({
  id: z.string().optional(),
  name: z.string().min(1).max(120),
  type: z.enum([
    'openai',
    'anthropic',
    'deepseek',
    'gemini',
    'grok',
    'mistral',
    'qwen',
    'openrouter',
    'ollama',
    'github-models',
    'azure-openai',
    'bedrock',
    'vertex',
    'together',
    'cohere',
    'perplexity'
  ]),
  authType: z
    .enum(['api-key', 'bearer', 'x-api-key', 'local-url', 'oauth', 'aws-iam', 'service-account'])
    .optional(),
  baseUrl: z.string().url().optional().or(z.literal('')),
  model: z.string().min(1).max(120),
  apiKey: z.string().optional(),
  monthlyTokenLimit: z.number().int().positive().nullable().optional(),
  taskDefaults: z
    .record(
      z.enum(['analysis', 'code-generation', 'documentation', 'refactor', 'agent', 'bug-review', 'test-generation', 'upgrade']),
      z.boolean()
    )
    .optional(),
  isDefault: z.boolean().optional(),
  enabled: z.boolean().optional()
})

export const aiResponseSchema = z.object({
  summary: z.string().default(''),
  problems: z.array(z.string()).default([]),
  recommendations: z.array(z.string()).default([]),
  tasks: z
    .array(
      z.object({
        title: z.string(),
        description: z.string().optional(),
        riskLevel: z.enum(['low', 'medium', 'high']).optional()
      })
    )
    .default([]),
  riskLevel: z.enum(['low', 'medium', 'high']).default('medium')
})
