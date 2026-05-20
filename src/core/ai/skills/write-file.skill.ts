import fs from 'node:fs/promises'
import path from 'node:path'
import { isPathInsideWorkspace } from '@core/utils/path-security'
import type { Skill, SkillContext } from './skill.types'

/** Entrada requerida para crear o sobrescribir un archivo de proyecto. */
export interface WriteFileInput {
  filePath: string;
  content: string;
}

/** Skill segura de escritura usada por el agente para aplicar cambios auditables. */
export const writeFileSkill: Skill<WriteFileInput, string> = {
  name: 'writeFile',
  description: 'Crea o sobrescribe un archivo con nuevo contenido. Úsalo para aplicar correcciones, refactorizaciones o crear nuevos archivos en el proyecto.',
  schema: {
    type: 'object',
    properties: {
      filePath: {
        type: 'string',
        description: 'Ruta relativa del archivo a modificar o crear (ej. "src/index.ts").'
      },
      content: {
        type: 'string',
        description: 'El contenido completo y final que tendrá el archivo.'
      }
    },
    required: ['filePath', 'content']
  },
  execute: async (input: WriteFileInput, context: SkillContext) => {
    try {
      // La ruta absoluta se deriva de projectPath y luego se valida contra escapes.
      const targetPath = path.resolve(context.projectPath, input.filePath)

      if (!isPathInsideWorkspace(context.projectPath, targetPath)) {
        return `Error: Acceso denegado. No puedes escribir fuera de ${context.projectPath}`
      }

      // Lee el contenido anterior para generar un diff visual si el archivo existe.
      let beforeContent: string | null = null
      try {
        beforeContent = await fs.readFile(targetPath, 'utf-8')
      } catch {
        // Archivo nuevo: beforeContent queda en null para señalizar creacion.
      }

      // Asegura que el directorio padre exista antes de escribir el archivo.
      const dir = path.dirname(targetPath)
      await fs.mkdir(dir, { recursive: true })

      await fs.writeFile(targetPath, input.content, 'utf-8')

      // Notifica el diff al runner para que el renderer pueda mostrarlo en tiempo real.
      if (context.onFileDiff) {
        context.onFileDiff({
          filePath: input.filePath,
          before: beforeContent,
          after: input.content
        })
      }

      return `Éxito: Archivo ${input.filePath} modificado correctamente.`
    } catch (error) {
      const message = error instanceof Error ? error.message : 'Error desconocido.'
      return `Error al escribir archivo: ${message}`
    }
  }
}
