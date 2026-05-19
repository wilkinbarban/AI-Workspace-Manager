export interface SkillParameter {
  type: string;
  description?: string;
  enum?: string[];
  items?: SkillParameter;
}

export interface SkillSchema {
  type: 'object';
  properties: Record<string, SkillParameter>;
  required?: string[];
}

export interface SkillContext {
  projectId: string;
  projectPath: string;
  onFileDiff?: (diff: { filePath: string; before: string | null; after: string }) => void;
}

export interface Skill<TInput = unknown, TOutput = unknown> {
  name: string;
  description: string;
  schema: SkillSchema;
  execute(input: TInput, context: SkillContext): Promise<TOutput>;
}
