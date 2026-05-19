import path from 'node:path'
import fs from 'fs-extra'
import fg from 'fast-glob'
import type { FileTreeNode, WorkspaceAnalysis, WorkspaceHealth } from '@shared/types/workspace'

const IGNORED_DIRECTORIES = [
  'node_modules',
  '.git',
  'dist',
  'build',
  'out',
  'coverage',
  '.next',
  '.turbo',
  '.cache',
  '.venv',
  'venv',
  '__pycache__'
]

const LARGE_FILE_BYTES = 1024 * 1024
const MAX_TREE_FILES = 500
const MAX_SCAN_FILES = 6000

const LANGUAGE_BY_EXTENSION: Record<string, string> = {
  '.ts': 'TypeScript',
  '.tsx': 'TypeScript',
  '.js': 'JavaScript',
  '.jsx': 'JavaScript',
  '.py': 'Python',
  '.cs': 'C#',
  '.java': 'Java',
  '.go': 'Go',
  '.rs': 'Rust',
  '.php': 'PHP',
  '.rb': 'Ruby',
  '.swift': 'Swift',
  '.kt': 'Kotlin'
}

/**
 * Analizador local de workspaces.
 * Detecta lenguajes, frameworks, dependencias, archivos grandes y calcula una puntuacion de salud del proyecto.
 */
export class WorkspaceScanner {
  /**
   * Escanea una carpeta de proyecto y devuelve un analisis con arbol de archivos,
   * dependencias, problemas detectados, recomendaciones y health score.
   *
   * @param workspacePath Ruta absoluta de la carpeta a analizar.
   * @returns Analisis estructurado del workspace.
   * @throws Error si la ruta no es una carpeta.
   */
  async scan(workspacePath: string): Promise<WorkspaceAnalysis> {
    const stat = await fs.stat(workspacePath)

    if (!stat.isDirectory()) {
      throw new Error('Workspace path must be a directory.')
    }

    const files = await fg('**/*', {
      cwd: workspacePath,
      dot: true,
      onlyFiles: true,
      unique: true,
      ignore: IGNORED_DIRECTORIES.map((dir) => `**/${dir}/**`),
      absolute: false,
      followSymbolicLinks: false
    })

    const limitedFiles = files.slice(0, MAX_SCAN_FILES)
    const packageJson = await this.readPackageJson(workspacePath)
    const pyproject = await this.readTextIfExists(workspacePath, 'pyproject.toml')
    const requirements = await this.readTextIfExists(workspacePath, 'requirements.txt')

    const dependencies = this.detectDependencies(packageJson, pyproject, requirements)
    const mainLanguage = this.detectLanguage(limitedFiles, packageJson, pyproject)
    const framework = this.detectFramework(dependencies, limitedFiles)
    const largeFiles = await this.detectLargeFiles(workspacePath, limitedFiles)
    const hasReadme = limitedFiles.some((file) => /^readme(\.|$)/i.test(path.basename(file)))
    const hasLicense = limitedFiles.some((file) => /^licen[cs]e(\.|$)/i.test(path.basename(file)))
    const hasDocker = limitedFiles.some((file) => /^dockerfile$/i.test(path.basename(file)) || /docker-compose.*\.ya?ml$/i.test(file))
    const hasGit = await fs.pathExists(path.join(workspacePath, '.git'))
    const hasTests = this.detectTests(limitedFiles)
    const problems = this.detectProblems({
      hasReadme,
      hasLicense,
      hasTests,
      hasDocker,
      hasGit,
      largeFiles,
      totalFiles: files.length
    })
    const recommendations = this.buildRecommendations(problems, {
      hasDocker,
      hasGit,
      mainLanguage,
      framework
    })
    const health = this.calculateHealth({
      hasReadme,
      hasLicense,
      hasTests,
      hasDocker,
      hasGit,
      largeFiles,
      problems,
      totalFiles: files.length
    })

    return {
      summary: {
        projectName: path.basename(workspacePath),
        mainLanguage,
        framework,
        hasDocker,
        hasGit,
        hasReadme,
        hasLicense,
        hasTests,
        totalFiles: files.length,
        largeFiles,
        ignoredDirectories: IGNORED_DIRECTORIES
      },
      fileTree: this.buildFileTree(limitedFiles.slice(0, MAX_TREE_FILES)),
      dependencies,
      problems,
      recommendations,
      health
    }
  }

  private async readPackageJson(workspacePath: string): Promise<Record<string, unknown> | null> {
    const packagePath = path.join(workspacePath, 'package.json')

    if (!(await fs.pathExists(packagePath))) {
      return null
    }

    try {
      return await fs.readJson(packagePath)
    } catch {
      return null
    }
  }

  private async readTextIfExists(workspacePath: string, relativePath: string): Promise<string | null> {
    const filePath = path.join(workspacePath, relativePath)

    if (!(await fs.pathExists(filePath))) {
      return null
    }

    return fs.readFile(filePath, 'utf8')
  }

  private detectDependencies(
    packageJson: Record<string, unknown> | null,
    pyproject: string | null,
    requirements: string | null
  ): string[] {
    const deps = new Set<string>()

    for (const section of ['dependencies', 'devDependencies', 'peerDependencies', 'optionalDependencies']) {
      const values = packageJson?.[section]

      if (values && typeof values === 'object') {
        Object.keys(values).forEach((dependency) => deps.add(dependency))
      }
    }

    requirements
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('#'))
      .forEach((line) => deps.add(line.split(/[<>=~!]/)[0].trim()))

    const poetryDeps = pyproject?.match(/\[tool\.poetry\.dependencies][\s\S]*?(?=\n\[|$)/)?.[0]
    poetryDeps
      ?.split(/\r?\n/)
      .map((line) => line.trim())
      .filter((line) => line && !line.startsWith('[') && !line.startsWith('#') && line.includes('='))
      .forEach((line) => deps.add(line.split('=')[0].trim().replace(/^"|"$/g, '')))

    return [...deps].sort((a, b) => a.localeCompare(b))
  }

  private detectLanguage(
    files: string[],
    packageJson: Record<string, unknown> | null,
    pyproject: string | null
  ): string | null {
    const devDependencies = packageJson?.devDependencies
    const hasTypescriptDependency = Boolean(
      devDependencies &&
      typeof devDependencies === 'object' &&
      'typescript' in devDependencies
    )
    if (hasTypescriptDependency || files.some((file) => file.endsWith('.ts') || file.endsWith('.tsx'))) {
      return 'TypeScript'
    }

    if (pyproject || files.some((file) => file.endsWith('.py'))) {
      return 'Python'
    }

    const counts = new Map<string, number>()

    for (const file of files) {
      const language = LANGUAGE_BY_EXTENSION[path.extname(file).toLowerCase()]

      if (language) {
        counts.set(language, (counts.get(language) ?? 0) + 1)
      }
    }

    return [...counts.entries()].sort((a, b) => b[1] - a[1])[0]?.[0] ?? null
  }

  private detectFramework(dependencies: string[], files: string[]): string | null {
    const normalized = new Set(dependencies.map((dependency) => dependency.toLowerCase()))

    if (normalized.has('electron') || files.some((file) => file.includes('electron.vite.config'))) return 'Electron'
    if (normalized.has('next')) return 'Next.js'
    if (normalized.has('react')) return 'React'
    if (normalized.has('vue')) return 'Vue'
    if (normalized.has('svelte')) return 'Svelte'
    if (normalized.has('fastapi')) return 'FastAPI'
    if (normalized.has('django')) return 'Django'
    if (normalized.has('flask')) return 'Flask'
    if (normalized.has('pyqt6') || normalized.has('pyside6')) return 'Qt for Python'

    return null
  }

  private async detectLargeFiles(workspacePath: string, files: string[]): Promise<string[]> {
    const largeFiles: string[] = []

    for (const file of files) {
      try {
        const stat = await fs.stat(path.join(workspacePath, file))

        if (stat.size >= LARGE_FILE_BYTES) {
          largeFiles.push(file)
        }
      } catch {
        continue
      }
    }

    return largeFiles.slice(0, 20)
  }

  private detectTests(files: string[]): boolean {
    return files.some((file) => {
      const normalized = file.replace(/\\/g, '/').toLowerCase()

      return (
        normalized.includes('/test/') ||
        normalized.includes('/tests/') ||
        normalized.endsWith('.test.ts') ||
        normalized.endsWith('.test.tsx') ||
        normalized.endsWith('.spec.ts') ||
        normalized.endsWith('.spec.tsx') ||
        normalized.endsWith('_test.py')
      )
    })
  }

  private detectProblems(input: {
    hasReadme: boolean
    hasLicense: boolean
    hasTests: boolean
    hasDocker: boolean
    hasGit: boolean
    largeFiles: string[]
    totalFiles: number
  }): string[] {
    const problems: string[] = []

    if (!input.hasReadme) problems.push('No hay README detectable.')
    if (!input.hasLicense) problems.push('No hay licencia detectable.')
    if (!input.hasTests) problems.push('No hay tests detectables.')
    if (!input.hasGit) problems.push('No parece ser un repositorio Git.')
    if (!input.hasDocker) problems.push('No hay configuracion Docker detectable.')
    if (input.largeFiles.length > 0) problems.push(`Hay ${input.largeFiles.length} archivo(s) grande(s) en el workspace.`)
    if (input.totalFiles > MAX_SCAN_FILES) problems.push('El proyecto supera el limite inicial de archivos analizados.')

    return problems
  }

  private buildRecommendations(
    problems: string[],
    context: { hasDocker: boolean; hasGit: boolean; mainLanguage: string | null; framework: string | null }
  ): string[] {
    const recommendations: string[] = problems.map((problem) => {
      if (problem.includes('README')) return 'Crear o actualizar README con instalacion, uso y estructura del proyecto.'
      if (problem.includes('licencia')) return 'Definir una licencia explicita para aclarar permisos de uso.'
      if (problem.includes('tests')) return 'Agregar pruebas basicas para los flujos principales.'
      if (problem.includes('Git')) return 'Inicializar Git antes de aplicar cambios guiados.'
      if (problem.includes('Docker')) return 'Evaluar Dockerfile o compose si el proyecto requiere entorno reproducible.'
      if (problem.includes('grande')) return 'Revisar archivos grandes y mover artefactos generados fuera del repo.'
      return 'Revisar este hallazgo y convertirlo en una tarea concreta.'
    })

    if (context.mainLanguage) {
      recommendations.push(`Documentar convenciones principales para ${context.mainLanguage}.`)
    }

    if (context.framework) {
      recommendations.push(`Registrar decisiones de arquitectura para ${context.framework}.`)
    }

    if (context.hasDocker && context.hasGit) {
      recommendations.push('Usar Git como punto de control antes de cambios grandes.')
    }

    return [...new Set(recommendations)]
  }

  private calculateHealth(input: {
    hasReadme: boolean
    hasLicense: boolean
    hasTests: boolean
    hasDocker: boolean
    hasGit: boolean
    largeFiles: string[]
    problems: string[]
    totalFiles: number
  }): WorkspaceHealth {
    const documentation = Math.min(100, (input.hasReadme ? 60 : 0) + (input.hasLicense ? 30 : 0) + 10)
    const tests = input.hasTests ? 75 : 15
    const git = input.hasGit ? 90 : 20
    const docker = input.hasDocker ? 85 : 35
    const security = input.largeFiles.length === 0 ? 82 : 62
    const architecture = input.totalFiles < MAX_SCAN_FILES ? 78 : 58
    const dependencies = input.problems.some((problem) => problem.includes('limite')) ? 55 : 78
    const modularity = input.totalFiles > 0 ? 72 : 30
    const maintainability = Math.max(20, 85 - input.problems.length * 8)
    const score = Math.round(
      (documentation + tests + git + docker + security + architecture + dependencies + modularity + maintainability) / 9
    )

    return {
      score,
      architecture,
      documentation,
      dependencies,
      tests,
      security,
      git,
      docker,
      modularity,
      maintainability
    }
  }

  private buildFileTree(files: string[]): FileTreeNode[] {
    const root: FileTreeNode[] = []

    for (const file of files.sort((a, b) => a.localeCompare(b))) {
      const parts = file.replace(/\\/g, '/').split('/')
      let current = root
      let relativePath = ''

      parts.forEach((part, index) => {
        relativePath = relativePath ? `${relativePath}/${part}` : part
        const isFile = index === parts.length - 1
        let node = current.find((item) => item.name === part)

        if (!node) {
          node = {
            name: part,
            relativePath,
            kind: isFile ? 'file' : 'directory',
            children: isFile ? undefined : []
          }
          current.push(node)
        }

        if (!isFile) {
          current = node.children ?? []
        }
      })
    }

    return root
  }
}
