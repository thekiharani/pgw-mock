import path from 'node:path';
import { fileURLToPath } from 'node:url';

import tailwindcss from '@tailwindcss/vite';
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

const root = path.dirname(fileURLToPath(import.meta.url));

export default defineConfig({
  plugins: [react(), tailwindcss()],
  resolve: {
    alias: {
      '@': path.resolve(root, 'src'),
      '@shared': path.resolve(root, '../shared'),
    },
  },
  server: {
    port: 3200,
    proxy: {
      '/api': { target: 'http://localhost:4200', changeOrigin: false },
    },
    fs: { allow: ['..'] },
  },
});
