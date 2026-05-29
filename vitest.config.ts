import { defineConfig } from 'vitest/config';

export default defineConfig({
  define: {
    'import.meta.env.VITE_API_BASE': JSON.stringify('http://localhost:3001/api'),
  },
  test: {
    globals: true,
    environment: 'jsdom',
    environmentMatchGlobs: [
      ['server/src/**/*.test.ts', 'node'],
    ],
    include: ['src/**/*.test.{ts,tsx}', 'server/src/**/*.test.ts'],
    coverage: {
      reporter: ['text', 'html'],
      include: ['src/**/*.ts', 'src/**/*.tsx', 'server/src/**/*.ts'],
      exclude: ['**/*.test.*', '**/*.d.ts', '**/node_modules/**'],
    },
  },
  resolve: {
    alias: {
      '@': '/src',
    },
  },
});
