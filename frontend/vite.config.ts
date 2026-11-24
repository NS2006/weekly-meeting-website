/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig } from 'vite';

export default defineConfig({
  plugins: [react()],
  server: {
    host: '127.0.0.1',
    port: 5173,
    strictPort: true,
    // The browser only ever talks to this origin; /api goes to the Express backend (same-origin cookies).
    proxy: { '/api': 'http://127.0.0.1:3000' },
    allowedHosts: ['vividness-why-issue.ngrok-free.dev'],
  },
  test: {
    environment: 'node',
    include: ['src/**/*.test.ts'],
  },
});
