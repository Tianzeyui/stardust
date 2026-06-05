import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import electron from 'vite-plugin-electron'
import renderer from 'vite-plugin-electron-renderer'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

const BUILD_YEAR = new Date().getFullYear()

export default defineConfig({
  define: {
    __BUILD_YEAR__: JSON.stringify(BUILD_YEAR),
  },
  plugins: [
    react(),
    electron([
      {
        entry: 'electron/main.ts',
        vite: {
          define: {
            __BUILD_YEAR__: JSON.stringify(BUILD_YEAR),
          },
          build: {
            rollupOptions: {
              external: [
                'node-llama-cpp',
                /^@node-llama-cpp\//,
                'mammoth',
                'esbuild',
              ],
            },
          },
        },
      },
      {
        entry: 'electron/preload.ts',
        onstart(args) {
          args.reload()
        },
        vite: {
          build: {
            rollupOptions: {
              output: {
                format: 'cjs',
              },
            },
          },
        },
      },
    ]),
    renderer(),
  ],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
  },
  resolve: {
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
  },
})
