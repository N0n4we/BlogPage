import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import fs from 'fs'
import path from 'path'

// Plugin to generate blog manifest
function blogManifestPlugin() {
  const blogsDir = path.resolve(__dirname, 'public/blogs')

  function generateManifest() {
    try {
      const files = fs.readdirSync(blogsDir)
        .filter(f => f.endsWith('.md'))
        .sort()
        .reverse()
      return JSON.stringify(files)
    } catch (e) {
      console.error('Error reading blogs directory:', e)
      return '[]'
    }
  }

  return {
    name: 'blog-manifest',
    configureServer(server) {
      server.middlewares.use((req, res, next) => {
        if (req.url === '/blogs/manifest.json') {
          res.setHeader('Content-Type', 'application/json')
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
  plugins: [react(), blogManifestPlugin()],
})
