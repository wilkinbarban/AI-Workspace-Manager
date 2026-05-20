import { resolve } from 'node:path'
import { defineConfig } from 'vitest/config'

/** Configuracion de Vitest alineada con los alias TypeScript del proyecto. */
export default defineConfig({
  test: {
    environment: 'node',
    globals: true
  },
  resolve: {
    alias: {
      '@core': resolve('src/core'),
      '@shared': resolve('src/shared'),
      '@database': resolve('src/database'),
      '@main': resolve('src/main'),
      '@renderer': resolve('src/renderer')
    }
  }
})
