/** Subconjunto de keytar que la aplicacion necesita para operar con secretos. */
type KeytarModule = {
  getPassword(service: string, account: string): Promise<string | null>
  setPassword(service: string, account: string, password: string): Promise<void>
  deletePassword(service: string, account: string): Promise<boolean>
}

/** Nombre de servicio usado en el almacen seguro del sistema operativo. */
const SERVICE_NAME = 'AI Workspace Manager'

/** Normaliza distintas formas de importacion de keytar (ESM/CJS/native). */
export function normalizeKeytarModule(importedModule: unknown): KeytarModule | null {
  const candidates = collectKeytarCandidates(importedModule)

  for (const candidate of candidates) {
    if (isKeytarModule(candidate)) {
      return candidate
    }
  }

  return null
}

/** Adaptador tolerante sobre keytar: si no esta instalado, permite fallback por .env. */
export class SecretStore {
  /** Recupera un secreto por cuenta o null cuando keytar no esta disponible. */
  async getSecret(account: string): Promise<string | null> {
    const keytar = await this.loadKeytar()

    if (keytar) {
      return keytar.getPassword(SERVICE_NAME, account)
    }

    return null
  }

  /** Guarda un secreto en el almacen seguro; falla si keytar no existe. */
  async setSecret(account: string, value: string): Promise<void> {
    const keytar = await this.loadKeytar()

    if (!keytar) {
      throw new Error('keytar is not available. Configure the provider with environment variables instead.')
    }

    await keytar.setPassword(SERVICE_NAME, account, value)
  }

  /** Elimina un secreto si el backend seguro esta disponible. */
  async deleteSecret(account: string): Promise<void> {
    const keytar = await this.loadKeytar()

    if (keytar) {
      await keytar.deletePassword(SERVICE_NAME, account)
    }
  }

  /** Importa keytar dinamicamente para no romper entornos donde sea dependencia opcional. */
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

/** Produce candidatos compatibles con default exports y module.exports. */
function collectKeytarCandidates(importedModule: unknown): unknown[] {
  if (!isRecord(importedModule)) {
    return [importedModule]
  }

  return [importedModule, importedModule.default, importedModule['module.exports']]
}

/** Type guard del contrato minimo de keytar requerido por SecretStore. */
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

/** Type guard basico para inspeccionar objetos desconocidos sin usar any. */
function isRecord(value: unknown): value is Record<string, unknown> {
  return typeof value === 'object' && value !== null
}
