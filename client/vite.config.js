import { defineConfig, loadEnv } from 'vite'
import { tanstackRouter } from '@tanstack/router-plugin/vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import path from 'path'

const injectSlinkAuth = (env) => (proxy) => {
  proxy.on('proxyReq', (proxyReq) => {
    proxyReq.setHeader('Authorization', `Bearer ${env.VITE_SLINK_API_KEY}`)
  })
  proxy.on('error', (err, req, res) => {
    console.error(`[proxy /bms error] ${req.method} ${req.url} ->`, err.message)
    if (res && !res.headersSent && typeof res.writeHead === 'function') {
      res.writeHead(502, { 'Content-Type': 'application/json' })
      res.end(JSON.stringify({ error: 'Upstream proxy error', message: err.message }))
    }
  })
}

export default defineConfig(({ mode }) => {
  const env = loadEnv(mode, path.resolve(__dirname, '..'), '')

  const isDev = env.VITE_ENV === 'development'
  const baseUrl = isDev ? env.VITE_DEVELOPMENT_API : env.VITE_PRODUCTION_API

  const apiPort = isDev ? env.VITE_SERVER_API_PORT : null
  const apiTarget = apiPort ? `${baseUrl}:${apiPort}` : baseUrl

  console.log('--- VITE CONFIG ---')
  console.log('Mode:', env.VITE_ENV)
  console.log('Resolved API Target:', apiTarget)
  console.log('------------------')

  const proxyConfig = {
    '/api': {
      target: apiTarget || 'http://localhost:3000',
      changeOrigin: true,
      secure: false,
      rewrite: (path) => path.replace(/^\/api/, ''),
    },
    '/ws': {
      target: apiTarget || 'http://localhost:3000',
      ws: true,
      changeOrigin: true,
      secure: false,
    },
    '/bms': {
      target: env.VITE_SLINK_API,
      changeOrigin: true,
      configure: injectSlinkAuth(env),
    },
  }

  return {
    plugins: [tanstackRouter(), react(), tailwindcss()],
    envDir: '../',
    server: {
      port: env.VITE_CLIENT_PORT ? parseInt(env.VITE_CLIENT_PORT) : 5173,
      allowedHosts: env.VITE_ALLOWED_ORIGIN ? env.VITE_ALLOWED_ORIGIN.split(',') : [],
      proxy: proxyConfig,
    },
    preview: {
      port: env.VITE_CLIENT_PORT ? parseInt(env.VITE_CLIENT_PORT) : 4173,
      allowedHosts: env.VITE_ALLOWED_ORIGIN ? env.VITE_ALLOWED_ORIGIN.split(',') : [],
      proxy: proxyConfig,
    },
    build: {
      outDir: 'dist',
      target: 'es2020',
      minify: 'terser',
      sourcemap: false,
      emptyOutDir: true,
    },
  }
})
