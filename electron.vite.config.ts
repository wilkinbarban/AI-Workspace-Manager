import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

/** Alias compartidos entre main, preload y renderer para evitar rutas relativas fragiles. */
const alias = {
  '@main': resolve('src/main'),
  '@core': resolve('src/core'),
  '@shared': resolve('src/shared'),
  '@database': resolve('src/database'),
  '@renderer': resolve('src/renderer')
}

/** Configuracion Electron Vite con bundles separados para main, preload y renderer. */
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    resolve: { alias },
    build: {
      rollupOptions: {
        input: {
          preload: resolve('src/main/preload.ts')
        }
      }
    }
  },
  renderer: {
    resolve: { alias },
    plugins: [react(), tailwindcss()]
  }
})
