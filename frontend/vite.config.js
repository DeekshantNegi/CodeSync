import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'
import tailwindcss from '@tailwindcss/vite'
import { nodePolyfills } from 'vite-plugin-node-polyfills'

export default defineConfig({
  define: {
    global: "globalThis",
  },
  plugins: [
    react(),
    tailwindcss(),
    nodePolyfills({
      include: ['buffer', 'events', 'process', 'stream', 'util'],
    }),
  ],
})