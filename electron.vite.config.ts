import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

const alias = {
  '@main': resolve('src/main'),
  '@core': resolve('src/core'),
  '@shared': resolve('src/shared'),
  '@database': resolve('src/database'),
  '@renderer': resolve('src/renderer')
}

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
