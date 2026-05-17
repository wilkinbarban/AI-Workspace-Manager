import { describe, expect, it, vi } from 'vitest'
import { normalizeKeytarModule } from '../src/main/security/secret-store'

const keytarMock = {
  getPassword: vi.fn(),
  setPassword: vi.fn(),
  deletePassword: vi.fn()
}

describe('SecretStore keytar loader', () => {
  it('accepts a direct keytar module', () => {
    expect(normalizeKeytarModule(keytarMock)).toBe(keytarMock)
  })

  it('accepts ESM default interop shape from keytar', () => {
    expect(normalizeKeytarModule({ default: keytarMock, getPassword: vi.fn() })).toBe(keytarMock)
  })

  it('rejects partial keytar modules', () => {
    expect(normalizeKeytarModule({ getPassword: vi.fn() })).toBeNull()
  })
})
