/** Parametro JSON Schema simplificado que se entrega a los modelos para function calling. */
export interface SkillParameter {
  type: string;
  description?: string;
  enum?: string[];
  items?: SkillParameter;
}

/** Schema de entrada de una skill; mantiene contrato comprensible para LLMs y validadores. */
export interface SkillSchema {
  type: 'object';
  properties: Record<string, SkillParameter>;
  required?: string[];
}

/** Contexto de ejecucion seguro que limita las skills al proyecto activo. */
export interface SkillContext {
  projectId: string;
  projectPath: string;
  onFileDiff?: (diff: { filePath: string; before: string | null; after: string }) => void;
}

/** Contrato comun de herramientas que puede invocar el agente autonomo. */
export interface Skill<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  schema: SkillSchema;
  execute(input: TInput, context: SkillContext): Promise<TOutput>;
}
