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
  build: {
    rollupOptions: {
      output: {
        // Split stable vendor code out of the app bundle so each chunk stays
        // well under the 500 kB warning threshold and caches independently.
        manualChunks(id) {
          if (!id.includes('node_modules')) return undefined;
          if (id.includes('@tanstack')) return 'tanstack';
          if (id.includes('@radix-ui')) return 'radix';
          if (id.includes('better-auth')) return 'auth';
          if (/node_modules\/(react|react-dom|scheduler)\//.test(id)) return 'react';
          return 'vendor';
        },
      },
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
