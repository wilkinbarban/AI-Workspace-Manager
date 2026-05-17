export function maskSecret(secret: string): string {
  const trimmed = secret.trim()
  if (!trimmed) return ''
  if (trimmed.length <= 8) return '****'
  return `${trimmed.slice(0, 3)}-****${trimmed.slice(-4)}`
}

export function envKeyForProvider(type: string): string {
  return `${type.toUpperCase().replace(/[^A-Z0-9]/g, '_')}_API_KEY`
}
