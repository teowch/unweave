import { defineConfig } from 'vite'
import react from '@vitejs/plugin-react'

// https://vite.dev/config/
export default defineConfig({
  plugins: [react()],
  // './' ensures built assets use relative paths — needed for Electron's file:// protocol
  base: './',
})
