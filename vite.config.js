import { defineConfig } from 'vite'
    import react from '@vitejs/plugin-react'

    // https://vitejs.dev/config/
    export default defineConfig({
      plugins: [react()],
      base: './', // 重要：確保在 GitHub Pages 上路徑正確
    })
