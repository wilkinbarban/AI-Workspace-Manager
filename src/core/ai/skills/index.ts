export * from './skill.types'
export * from './list-dir.skill'
export * from './read-file.skill'
export * from './write-file.skill'

import { listDirSkill } from './list-dir.skill'
import { readFileSkill } from './read-file.skill'
import { writeFileSkill } from './write-file.skill'
import type { Skill } from './skill.types'

/** Registro central de skills disponibles para el agente autonomo. */
export const allSkills: Skill[] = [
  listDirSkill,
  readFileSkill,
  writeFileSkill
]
