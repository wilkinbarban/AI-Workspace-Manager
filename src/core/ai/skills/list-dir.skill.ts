import fs from 'node:fs/promises'
import path from 'node:path'
import type { Skill, SkillContext } from './skill.types'

export interface ListDirInput {
  directoryPath: string;
}

export const listDirSkill: Skill<ListDirInput, string> = {
  name: 'listDir',
  description: 'Lista los archivos y carpetas de un directorio. Usa esto para explorar la estructura del proyecto y saber que archivos existen.',
  schema: {
    type: 'object',
    properties: {
      directoryPath: {
        type: 'string',
        description: 'Ruta relativa al directorio raíz del proyecto (ej. "src/components" o "." para la raíz).'
      }
    },
    required: ['directoryPath']
  },
  execute: async (input: ListDirInput, context: SkillContext) => {
    try {
      const targetPath = path.resolve(context.projectPath, input.directoryPath || '.')
      
      // Seguridad: Path traversal check
      if (!targetPath.startsWith(context.projectPath)) {
        return `Error: Acceso denegado. No puedes leer fuera de ${context.projectPath}`
      }

      const entries = await fs.readdir(targetPath, { withFileTypes: true })
      const result = entries.map(entry => {
        return `${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${entry.name}`
      }).join('\n')

      return result || '(Directorio vacío)'
    } catch (err: any) {
      return `Error al leer directorio: ${err.message}`
    }
  }
}
