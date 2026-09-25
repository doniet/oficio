import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  // Solo `vite dev`: en producción el proxy de /api lo hace nginx (nginx.conf).
  server: {
    proxy: {
      '/api': { target: process.env.BACKEND_URL || 'http://localhost:3000', changeOrigin: true },
    },
  },
  build: {
    target: 'es2020',
    cssCodeSplit: true,
    rollupOptions: {
      output: {
        manualChunks: {
          react: ['react', 'react-dom', 'react-router-dom'],
          map: ['leaflet', 'react-leaflet'],
        },
      },
    },
  },
});
