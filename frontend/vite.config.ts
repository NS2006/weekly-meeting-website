/// <reference types="vitest/config" />
import react from '@vitejs/plugin-react';
import { defineConfig, loadEnv } from 'vite';

export default defineConfig(({ mode }) => {
  // The owner's ngrok demo host, from the gitignored frontend/.env.local (DEV_ALLOWED_HOSTS, comma-separated). Demo
  // only: to be removed before the code is pushed. No VITE_ prefix, so it never reaches the browser's code.
  const env = loadEnv(mode, process.cwd(), '');
  const allowedHosts = (env.DEV_ALLOWED_HOSTS ?? '')
    .split(',')
    .map((host) => host.trim())
    .filter(Boolean);

  return {
    plugins: [react()],
    server: {
      host: '127.0.0.1',
      port: 5173,
      strictPort: true,
      // The browser only ever talks to this origin; /api goes to the Express backend (same-origin cookies).
      proxy: { '/api': 'http://127.0.0.1:3000' },
      allowedHosts,
      // Files the dev server may hand out (relative to frontend/): the app, the shared types and installed packages.
      // Vite's default is the whole repository, so through a tunnel anyone could fetch backend/ (uploaded pictures)
      // or dummy_data/ (real names) by path (README review, 2026-11-25).
      fs: { allow: ['.', '../shared', '../node_modules'] },
    },
    test: {
      environment: 'node',
      include: ['src/**/*.test.ts'],
    },
  };
});
