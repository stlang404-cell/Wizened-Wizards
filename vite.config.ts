/// <reference types="vitest/config" />
import { defineConfig } from 'vite';
import react from '@vitejs/plugin-react';

export default defineConfig({
  plugins: [react()],
  base: './',
  build: {
    outDir: 'dist',
    chunkSizeWarningLimit: 2000,
    rollupOptions: {
      output: { manualChunks: { phaser: ['phaser'] } },
    },
  },
  test: {
    environment: 'node',
    include: process.env.AUDIT ? ['tests/audit/**/*.test.ts'] : ['tests/**/*.test.ts'],
    exclude: process.env.AUDIT ? [] : ['tests/audit/**', 'node_modules/**'],
    testTimeout: 60000,
  },
});
