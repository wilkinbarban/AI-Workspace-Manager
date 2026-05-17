import fs from 'node:fs/promises'
import path from 'node:path'
import type { Skill, SkillContext } from './skill.types'

export interface WriteFileInput {
  filePath: string;
  content: string;
}

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
      const targetPath = path.resolve(context.projectPath, input.filePath)

      // Seguridad: Path traversal check
      if (!targetPath.startsWith(context.projectPath)) {
        return `Error: Acceso denegado. No puedes escribir fuera de ${context.projectPath}`
      }

      // Leer contenido anterior para el diff (si el archivo existe)
      let beforeContent: string | null = null
      try {
        beforeContent = await fs.readFile(targetPath, 'utf-8')
      } catch {
        // Archivo nuevo — before = null
      }

      // Asegurar que el directorio exista
      const dir = path.dirname(targetPath)
      await fs.mkdir(dir, { recursive: true })

      await fs.writeFile(targetPath, input.content, 'utf-8')

      // Notificar diff al runner a través del contexto
      if (context.onFileDiff) {
        context.onFileDiff({
          filePath: input.filePath,
          before: beforeContent,
          after: input.content
        })
      }

      return `Éxito: Archivo ${input.filePath} modificado correctamente.`
    } catch (err: any) {
      return `Error al escribir archivo: ${err.message}`
    }
  }
}
