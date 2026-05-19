import fs from 'node:fs/promises'
import os from 'node:os'
import path from 'node:path'
import { afterEach, beforeEach, describe, expect, it } from 'vitest'
import { listDirSkill, readFileSkill, writeFileSkill } from '@core/ai/skills'
import type { SkillContext } from '@core/ai/skills'

let tempRoot: string
let workspacePath: string
let siblingPath: string
let context: SkillContext

beforeEach(async () => {
  tempRoot = await fs.mkdtemp(path.join(os.tmpdir(), 'aiwm-skills-'))
  workspacePath = path.join(tempRoot, 'repo')
  siblingPath = path.join(tempRoot, 'repo-malicious')
  await fs.mkdir(workspacePath, { recursive: true })
  await fs.mkdir(siblingPath, { recursive: true })
  await fs.writeFile(path.join(workspacePath, 'safe.txt'), 'contenido seguro', 'utf8')
  await fs.writeFile(path.join(siblingPath, 'secret.txt'), 'fuera del workspace', 'utf8')
  context = { projectId: 'project-id', projectPath: workspacePath }
})

afterEach(async () => {
  await fs.rm(tempRoot, { recursive: true, force: true })
})

describe('agent skills path security', () => {
  it('allows reads inside the workspace', async () => {
    await expect(readFileSkill.execute({ filePath: 'safe.txt' }, context)).resolves.toBe('contenido seguro')
  })

  it('rejects reads from sibling paths that share the workspace prefix', async () => {
    const result = await readFileSkill.execute({ filePath: '../repo-malicious/secret.txt' }, context)

    expect(result).toContain('Acceso denegado')
  })

  it('rejects directory listing outside the workspace', async () => {
    const result = await listDirSkill.execute({ directoryPath: '../repo-malicious' }, context)

    expect(result).toContain('Acceso denegado')
  })

  it('rejects writes outside the workspace', async () => {
    const result = await writeFileSkill.execute({ filePath: '../repo-malicious/pwned.txt', content: 'x' }, context)

    await expect(fs.stat(path.join(siblingPath, 'pwned.txt'))).rejects.toThrow()
    expect(result).toContain('Acceso denegado')
  })
})
