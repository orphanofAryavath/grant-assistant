import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

// In development the Express API runs on :8787; in production both are served from one Vercel domain.
export default defineConfig({
  plugins: [react()],
  server: { proxy: { '/api': 'http://localhost:8787' } },
});
