import { resolve } from 'node:path'
import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'

// Renderer root is src/renderer (index.html lives there). Main and preload are bundled
// as CJS because package.json has no "type": "module" — keep it that way so the
// sandboxed preload can require('electron').
export default defineConfig({
  main: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: {
          // The app entry, plus the standalone verification scripts run by
          // `npm run db:verify`, `npm run import:verify`, `npm run grouping:verify` and
          // `npm run review:verify`.
          index: resolve(__dirname, 'src/main/index.ts'),
          'release-verify': resolve(__dirname, 'src/main/release-verify.ts'),
          'db-verify': resolve(__dirname, 'src/main/db-verify.ts'),
          'import-verify': resolve(__dirname, 'src/main/import-verify.ts'),
          'grouping-verify': resolve(__dirname, 'src/main/grouping-verify.ts'),
          'review-verify': resolve(__dirname, 'src/main/review-verify.ts')
        }
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },
  preload: {
    plugins: [externalizeDepsPlugin()],
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/preload/index.ts')
      }
    },
    resolve: {
      alias: {
        '@shared': resolve(__dirname, 'src/shared')
      }
    }
  },
  renderer: {
    root: resolve(__dirname, 'src/renderer'),
    plugins: [react(), tailwindcss()],
    resolve: {
      alias: {
        '@': resolve(__dirname, 'src/renderer'),
        '@shared': resolve(__dirname, 'src/shared')
      }
    },
    build: {
      rollupOptions: {
        input: resolve(__dirname, 'src/renderer/index.html')
      }
    }
  }
})
