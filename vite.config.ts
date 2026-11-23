import path from 'node:path';
import { fileURLToPath } from 'node:url';
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';
import tailwindcss from '@tailwindcss/vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      // The application may import '@canon' and nothing else. Deep paths such as
      // '@canon/components/Button' are rejected by scripts/check-boundaries.mjs,
      // so the canon's internals stay free to be refactored.
      '@canon': path.resolve(root, 'src/canon'),
      '@app': path.resolve(root, 'src/app'),
    },
  },
  //  Relative, so the build works from any folder — GitHub Pages serves it at
  //  /MO-replenishment/, not at the domain root.
  base: './',
  server: { port: 5183, strictPort: true, open: false },
});
