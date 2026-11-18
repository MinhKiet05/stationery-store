import react from '@vitejs/plugin-react'
import { defineConfig, loadEnv } from 'vite'
import tailwindcss from "@tailwindcss/vite";


export default defineConfig(({ command, mode }) => {
  const env = loadEnv(mode, process.cwd(), '')
  if (command === 'build') {
    const message = 'Set VITE_API_BASE_URL to the public HTTPS backend origin without /api before building.'
    let backendOrigin: URL
    try {
      backendOrigin = new URL(env.VITE_API_BASE_URL?.trim() || '')
    } catch {
      throw new Error(message)
    }
    if (backendOrigin.protocol !== 'https:' || backendOrigin.pathname !== '/' || backendOrigin.search ||
        backendOrigin.hash || backendOrigin.username || backendOrigin.password ||
        ['localhost', '127.0.0.1', '[::1]'].includes(backendOrigin.hostname)) {
      throw new Error(message)
    }
  }
  return {
    plugins: [react(), tailwindcss()],
    server: {
      proxy: {
        '/api': {
          target: env.DEV_API_PROXY_TARGET || 'http://localhost:10000',
          changeOrigin: true,
        },
      },
    },
  }
})
