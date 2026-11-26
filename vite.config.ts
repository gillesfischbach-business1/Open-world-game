import { defineConfig } from 'vite';
// base './' damit das Spiel unter jeder Adresse läuft (GitHub Pages, eigener Server, Unterordner)
export default defineConfig({
  base: './',
  build: { target: 'es2022', chunkSizeWarningLimit: 6000, assetsInlineLimit: 0 },
  optimizeDeps: { exclude: ['@babylonjs/havok'] },
});
