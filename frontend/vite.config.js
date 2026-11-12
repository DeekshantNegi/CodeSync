import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  define: {
    global: "globalThis",
  },
  server: {
    host: '127.0.0.1',
    allowedHosts: process.env.VITE_ALLOWED_HOST ? [process.env.VITE_ALLOWED_HOST] : [],
    proxy: {
      '/api': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        configure: (proxy) => {
          proxy.on('proxyReq', (proxyReq) => {
            proxyReq.setHeader('Origin', 'http://localhost:5173')
          })
        },
      },
      '/ws': {
        target: 'http://127.0.0.1:8080',
        changeOrigin: true,
        ws: true,
        configure: (proxy) => {
          proxy.on('proxyReqWs', (proxyReq) => {
            proxyReq.setHeader('Origin', 'http://localhost:5173')
          })
        },
      },
      '/audio': {
        target: 'http://127.0.0.1:8090',
        changeOrigin: true,
        ws: true,
        rewrite: (path) => path.replace(/^\/audio/, ''),
      },
    },
  },
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      include: ['buffer', 'events', 'process', 'stream', 'util'],
    }),
  ],
})