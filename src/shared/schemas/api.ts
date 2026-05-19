import { z } from 'zod'
import { AI_AUTH_TYPES, AI_PROVIDER_TYPES, AI_TASK_TYPES, RISK_LEVELS } from '@shared/types/workspace'

export const projectIdSchema = z.string().min(1)
export const taskIdSchema = z.string().min(1)

export const askProjectSchema = z.object({
  projectId: projectIdSchema,
  message: z.string().min(1).max(8000),
  providerId: z.string().optional(),
  taskType: z.enum(AI_TASK_TYPES).default('analysis')
})

export const runAgentSchema = z.object({
  projectId: projectIdSchema,
  prompt: z.string().min(1).max(12000),
  providerId: z.string().min(1).optional()
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
  type: z.enum(AI_PROVIDER_TYPES),
  authType: z.enum(AI_AUTH_TYPES).optional(),
  baseUrl: z.string().url().optional().or(z.literal('')),
  model: z.string().min(1).max(120),
  apiKey: z.string().optional(),
  monthlyTokenLimit: z.number().int().positive().nullable().optional(),
  taskDefaults: z
    .record(
      z.enum(AI_TASK_TYPES),
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
        riskLevel: z.enum(RISK_LEVELS).optional()
      })
    )
    .default([]),
  riskLevel: z.enum(RISK_LEVELS).default('medium')
})
