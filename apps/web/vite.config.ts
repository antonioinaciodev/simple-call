import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // Em dev o Vite repassa /api para o servidor Node (apps/server).
    // ws: true repassa também o WebSocket da sinalização P2P.
    proxy: { '/api': { target: 'http://localhost:3001', ws: true } },
  },
  build: { target: 'es2022' },
});
