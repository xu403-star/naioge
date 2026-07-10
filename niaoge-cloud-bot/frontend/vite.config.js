import { defineConfig } from 'vite'
import vue from '@vitejs/plugin-vue'

export default defineConfig({
  plugins: [vue()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:3456',
      '/login': 'http://localhost:3456',
      '/v1': 'http://localhost:3456'
    }
  },
  build: {
    outDir: '../dist-vue',
    emptyOutDir: true
  }
})
