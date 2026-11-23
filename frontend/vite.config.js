import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/vlc': {
        target: 'http://127.0.0.1:5174', // VLC server ka port
        changeOrigin: true,
        ws: true,
      }
    }
  }
})