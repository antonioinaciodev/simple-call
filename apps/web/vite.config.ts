import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    // Em dev o Vite repassa /api para o servidor Node (apps/server).
    proxy: { '/api': 'http://localhost:3001' },
  },
  build: { target: 'es2022' },
});
