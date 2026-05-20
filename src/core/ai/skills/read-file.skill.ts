import fs from 'node:fs/promises'
import path from 'node:path'
import { isPathInsideWorkspace } from '@core/utils/path-security'
import type { Skill, SkillContext } from './skill.types'

/** Entrada requerida por la skill de lectura de archivos. */
export interface ReadFileInput {
  filePath: string;
}

/** Skill segura para leer archivos dentro del workspace activo. */
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
      // Se resuelve contra projectPath y luego se valida para impedir path traversal.
      const targetPath = path.resolve(context.projectPath, input.filePath)
      
      if (!isPathInsideWorkspace(context.projectPath, targetPath)) {
        return `Error: Acceso denegado. No puedes leer fuera de ${context.projectPath}`
      }

      // Lectura deliberadamente textual: las skills actuales no manipulan binarios.
      const content = await fs.readFile(targetPath, 'utf-8')
      return content
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido.'
      return `Error al leer archivo: ${message}`
    }
  }
}
