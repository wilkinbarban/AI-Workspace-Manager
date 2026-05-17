import path from 'node:path'
import fs from 'fs-extra'
import { PrismaClient } from '@prisma/client'

const normalizeSqlitePath = (filePath: string): string => filePath.replace(/\\/g, '/')

const defaultDatabasePath = path.resolve(process.cwd(), '.data', 'ai-workspace-manager.db')

if (!process.env.DATABASE_URL) {
  fs.ensureDirSync(path.dirname(defaultDatabasePath))
  process.env.DATABASE_URL = `file:${normalizeSqlitePath(defaultDatabasePath)}`
}

export const prisma = new PrismaClient()

export async function disconnectDatabase(): Promise<void> {
  await prisma.$disconnect()
}

export function parseJson<T>(value: string, fallback: T): T {
  try {
    return JSON.parse(value) as T
  } catch {
    return fallback
  }
}

export function stringifyJson(value: unknown): string {
  return JSON.stringify(value)
}
