import { defineConfig } from 'vite';
// base './' damit das Spiel unter jeder Adresse läuft (GitHub Pages, eigener Server, Unterordner)
export default defineConfig({
  base: './',
  build: {
    target: 'es2022', chunkSizeWarningLimit: 9000, assetsInlineLimit: 0,
    // SINGLE=1: alles in eine Datei (für die claude.ai-Messseite, die nur begrenzt viele Dateien hält)
    ...(process.env.SINGLE ? { rolldownOptions: { output: { codeSplitting: false } } } : {}),
  },
  optimizeDeps: { exclude: ['@babylonjs/havok'] },
});
