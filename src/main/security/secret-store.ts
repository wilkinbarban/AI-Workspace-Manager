type KeytarModule = {
  getPassword(service: string, account: string): Promise<string | null>
  setPassword(service: string, account: string, password: string): Promise<void>
  deletePassword(service: string, account: string): Promise<boolean>
}

const SERVICE_NAME = 'AI Workspace Manager'

export function normalizeKeytarModule(importedModule: unknown): KeytarModule | null {
  const candidates = collectKeytarCandidates(importedModule)

  for (const candidate of candidates) {
    if (isKeytarModule(candidate)) {
      return candidate
    }
  }

  return null
}

export class SecretStore {
  async getSecret(account: string): Promise<string | null> {
    const keytar = await this.loadKeytar()

    if (keytar) {
      return keytar.getPassword(SERVICE_NAME, account)
    }

    return null
  }

  async setSecret(account: string, value: string): Promise<void> {
    const keytar = await this.loadKeytar()

    if (!keytar) {
      throw new Error('keytar is not available. Configure the provider with environment variables instead.')
    }

    await keytar.setPassword(SERVICE_NAME, account, value)
  }

  async deleteSecret(account: string): Promise<void> {
    const keytar = await this.loadKeytar()

    if (keytar) {
      await keytar.deletePassword(SERVICE_NAME, account)
    }
  }

  private async loadKeytar(): Promise<KeytarModule | null> {
    try {
      const dynamicImport = new Function('specifier', 'return import(specifier)') as (
        specifier: string
      ) => Promise<unknown>

      return normalizeKeytarModule(await dynamicImport('keytar'))
    } catch {
      return null
    }
  }
}

function collectKeytarCandidates(importedModule: unknown): unknown[] {
  if (!isRecord(importedModule)) {
    return [importedModule]
  }

  return [importedModule, importedModule.default, importedModule['module.exports']]
}

function isKeytarModule(candidate: unknown): candidate is KeytarModule {
  if (!isRecord(candidate)) {
    return false
  }

  return (
    typeof candidate.getPassword === 'function' &&
    typeof candidate.setPassword === 'function' &&
    typeof candidate.deletePassword === 'function'
  )
}

function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
