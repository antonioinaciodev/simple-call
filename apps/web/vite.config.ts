import react from '@vitejs/plugin-react';
import { readFileSync } from 'node:fs';
import { defineConfig } from 'vite';

// Versão mostrada no rodapé da página inicial: a do package.json da raiz.
const { version } = JSON.parse(readFileSync(new URL('../../package.json', import.meta.url), 'utf8'));

export default defineConfig({
  plugins: [react()],
  define: { __APP_VERSION__: JSON.stringify(version) },
  server: {
    // Em dev o Vite repassa /api para o Worker local (wrangler dev, porta 3001).
    // ws: true repassa também o WebSocket da sinalização P2P.
    proxy: { '/api': { target: 'http://localhost:3001', ws: true } },
  },
  build: { target: 'es2022' },
});
