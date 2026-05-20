import path from 'node:path'
import fs from 'fs-extra'
import { PrismaClient } from '@prisma/client'

/** Convierte rutas Windows a formato compatible con SQLite file: URLs. */
const normalizeSqlitePath = (filePath: string): string => filePath.replace(/\\/g, '/')

/** Ruta por defecto para la base SQLite local cuando no existe DATABASE_URL. */
const defaultDatabasePath = path.resolve(process.cwd(), '.data', 'ai-workspace-manager.db')

// Garantiza una base de datos local funcional en instalaciones sin .env configurado.
if (!process.env.DATABASE_URL) {
  fs.ensureDirSync(path.dirname(defaultDatabasePath))
  process.env.DATABASE_URL = `file:${normalizeSqlitePath(defaultDatabasePath)}`
}

/** Cliente Prisma singleton compartido por servicios del proceso main. */
export const prisma = new PrismaClient()

/** Cierra la conexion de Prisma durante el apagado controlado de Electron. */
export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect()
}

/** Parsea JSON persistido en columnas string y devuelve fallback ante datos corruptos. */
export function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

/** Serializa estructuras DTO antes de persistirlas en columnas JSON textuales. */
export function stringifyJson(value: unknown): string {
  return JSON.stringify(value)
}
