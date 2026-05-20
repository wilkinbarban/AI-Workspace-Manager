import fs from 'node:fs/promises'
import path from 'node:path'
import { isPathInsideWorkspace } from '@core/utils/path-security'
import type { Skill, SkillContext } from './skill.types'

/** Entrada requerida para listar un directorio relativo al proyecto. */
export interface ListDirInput {
  directoryPath: string;
}

/** Skill segura para explorar la estructura del workspace sin salir de projectPath. */
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
      // La ruta vacia o "." representa la raiz del proyecto activo.
      const targetPath = path.resolve(context.projectPath, input.directoryPath || '.')
      
      if (!isPathInsideWorkspace(context.projectPath, targetPath)) {
        return `Error: Acceso denegado. No puedes leer fuera de ${context.projectPath}`
      }

      // withFileTypes evita llamadas stat adicionales y permite etiquetar carpetas/archivos.
      const entries = await fs.readdir(targetPath, { withFileTypes: true })
      const result = entries.map(entry => {
        return `${entry.isDirectory() ? '[DIR]' : '[FILE]'} ${entry.name}`
      }).join('\n')

      return result || '(Directorio vacío)'
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido.'
      return `Error al leer directorio: ${message}`
    }
  }
}
