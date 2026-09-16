import { defineConfig, externalizeDepsPlugin } from 'electron-vite'
import react from '@vitejs/plugin-react'
import { resolve } from 'node:path'
export default defineConfig({
  main: { plugins: [externalizeDepsPlugin()], build: { outDir: resolve(__dirname, 'out-trace/main'), rollupOptions: { input: { index: resolve(__dirname, 'src/trace/main.ts'), 'file-worker': resolve(__dirname, 'src/trace/file-worker.ts'), 'media-runner': resolve(__dirname, 'src/trace/media-runner.ts') } } } },
  preload: { plugins: [externalizeDepsPlugin()], build: { outDir: resolve(__dirname, 'out-trace/preload'), rollupOptions: { input: { index: resolve(__dirname, 'src/trace/preload.ts') } } } },
  renderer: { root: 'src/trace/renderer', plugins: [react()], build: { outDir: resolve(__dirname, 'out-trace/renderer'), rollupOptions: { input: resolve(__dirname, 'src/trace/renderer/index.html') } } },
})
