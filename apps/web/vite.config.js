import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the API runs separately on :4000. Proxying keeps the browser on a single
// origin, so session cookies and the live event stream work exactly as in production.
export default defineConfig({
  plugins: [react()],
  server: {
    port: 5173,
    proxy: {
      '/api': 'http://localhost:4000',
    },
  },
});
