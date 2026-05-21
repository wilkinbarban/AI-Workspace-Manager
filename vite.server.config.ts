import { resolve } from 'node:path'
import { defineConfig } from 'vite'

/** Alias compartidos con el resto del proyecto para mantener importaciones limpias. */
const alias = {
  '@main': resolve('src/main'),
  '@core': resolve('src/core'),
  '@shared': resolve('src/shared'),
  '@database': resolve('src/database'),
  '@renderer': resolve('src/renderer')
}

export default defineConfig({
  resolve: { alias },
  build: {
    lib: {
      entry: resolve('src/server/index.ts'),
      formats: ['es'],
      fileName: () => 'index.js'
    },
    outDir: resolve('out/server'),
    target: 'node20',
    ssr: true,
    emptyOutDir: true,
    rollupOptions: {
      // Excluye del bundle las dependencias nativas y el propio Electron para evitar errores de enlace
      external: [
        'electron',
        '@prisma/client',
        'keytar',
        'chokidar',
        'simple-git',
        'pino',
        'fs-extra',
        'fast-glob',
        'dotenv',
        'zod',
        'ws'
      ]
    }
  }
})
