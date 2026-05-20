import { z } from 'zod'
import { AI_AUTH_TYPES, AI_PROVIDER_TYPES, AI_TASK_TYPES, RISK_LEVELS } from '@shared/types/workspace'

/** Identificador de proyecto requerido por los handlers IPC. */
export const projectIdSchema = z.string().min(1)
/** Identificador de tarea requerido para operaciones sobre una tarea existente. */
export const taskIdSchema = z.string().min(1)

/** Valida las consultas de analisis IA y limita el tamano del prompt del usuario. */
export const askProjectSchema = z.object({
  projectId: projectIdSchema,
  message: z.string().min(1).max(8000),
  providerId: z.string().optional(),
  taskType: z.enum(AI_TASK_TYPES).default('analysis')
})

/** Valida la ejecucion del agente autonomo sobre un proyecto ya importado. */
export const runAgentSchema = z.object({
  projectId: projectIdSchema,
  prompt: z.string().min(1).max(12000),
  providerId: z.string().min(1).optional()
})

/** Valida la creacion manual de tareas desde el dashboard. */
export const createTaskSchema = z.object({
  projectId: projectIdSchema,
  input: z.object({
    title: z.string().min(1).max(220),
    description: z.string().max(2000).optional()
  })
})

/** Valida la configuracion de proveedores IA antes de persistirla o probarla. */
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

/** Normaliza la salida JSON esperada del modelo para analisis de proyecto. */
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
