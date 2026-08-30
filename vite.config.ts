import { defineConfig, Plugin } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'
import { fileURLToPath } from 'url'

const __dirname = path.dirname(fileURLToPath(import.meta.url))

// GitHub Pages serves project sites from /<repository>/.
// Keep local development and user-site deployments at the root.
const repositoryName = process.env.GITHUB_REPOSITORY?.split('/')[1] ?? ''
const base =
  process.env.GITHUB_ACTIONS === 'true' &&
  repositoryName !== '' &&
  !repositoryName.endsWith('.github.io')
    ? `/${repositoryName}/`
    : '/'

// Plugin to generate blog manifest
function blogManifestPlugin(): Plugin {
  const blogsDir = path.resolve(__dirname, 'public/blogs')
  const manifestPath = `${base}blogs/manifest.json`.replace(/\/+/g, '/')

  function generateManifest(): string {
    try {
      const files = fs.readdirSync(blogsDir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .reverse()
      return JSON.stringify(files)
    } catch {
      console.error('Error reading blogs directory')
      return '[]'
    }
  }

  return {
    name: 'blog-manifest',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        const requestPath = new URL(req.url ?? '/', 'http://localhost').pathname
        if (requestPath === manifestPath) {
          res.setHeader('Content-Type', 'application/json')
          res.setHeader('Cache-Control', 'no-store')
          res.end(generateManifest())
          return
        }
        next()
      })
    },
    writeBundle() {
      const manifest = generateManifest()
      const outDir = path.resolve(__dirname, 'dist/blogs')
      if (!fs.existsSync(outDir)) {
        fs.mkdirSync(outDir, { recursive: true })
      }
      fs.writeFileSync(path.join(outDir, 'manifest.json'), manifest)
    }
  }
}

// https://vite.dev/config/
export default defineConfig({
  base,
  plugins: [react(), blogManifestPlugin()],
  server: {
    proxy: {
      '/api': {
        target: 'http://localhost:3001',
        changeOrigin: true
      }
    }
  },
  optimizeDeps: {
    exclude: ['wasm-markdown']
  },
  build: {
    target: 'esnext'
  }
})
