import fs from 'node:fs/promises'
import path from 'node:path'
import type { Skill, SkillContext } from './skill.types'

export interface ReadFileInput {
  filePath: string;
}

export const readFileSkill: Skill<ReadFileInput, string> = {
  name: 'readFile',
  description: 'Lee el contenido de un archivo de texto. Usa esto para analizar código fuente antes de modificarlo.',
  schema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Ruta relativa del archivo (ej. "src/index.ts").'
      }
    },
    required: ['filePath']
  },
  execute: async (input: ReadFileInput, context: SkillContext) => {
    try {
      const targetPath = path.resolve(context.projectPath, input.filePath)
      
      // Seguridad: Path traversal check
      if (!targetPath.startsWith(context.projectPath)) {
        return `Error: Acceso denegado. No puedes leer fuera de ${context.projectPath}`
      }

      const content = await fs.readFile(targetPath, 'utf-8')
      return content
    } catch (err: any) {
      return `Error al leer archivo: ${err.message}`
    }
  }
}
