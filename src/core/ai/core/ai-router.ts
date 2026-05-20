import type { AITaskType } from '@shared/types/workspace'

/** Selecciona el proveedor IA segun solicitud explicita, defaults por tarea y default global. */
export function chooseProviderId(input: {
  requestedProviderId?: string
  taskType: AITaskType
  providers: Array<{ id: string; isDefault: boolean; enabled: boolean; taskDefaults: Partial<Record<AITaskType, boolean>> }>
}): string | null {
  if (input.requestedProviderId) return input.requestedProviderId

  const taskProvider = input.providers.find((provider) => provider.enabled && provider.taskDefaults[input.taskType])
  if (taskProvider) return taskProvider.id

  const defaultProvider = input.providers.find((provider) => provider.enabled && provider.isDefault)
  if (defaultProvider) return defaultProvider.id

  return input.providers.find((provider) => provider.enabled)?.id ?? null
}
