import { defineConfig } from 'vitest/config';
import react from '@vitejs/plugin-react';
import path from 'path';

export default defineConfig({
  plugins: [react()],
  test: {
    environment: 'jsdom',
    globals: true,
    setupFiles: './src/tests/setup.ts',
    alias: {
      '@': path.resolve(__dirname, './src'),
    },
    coverage: {
      provider: 'v8',
      include: ['src/**/*.{ts,tsx}'],
      exclude: [
        'src/**/*.test.{ts,tsx}',
        'src/**/index.ts',
        // Next.js App Router pages (app/) are excluded from unit test coverage.
        // These pages depend on Next.js runtime, server components, and
        // app-router-specific APIs that cannot be effectively tested in unit
        // tests without running a full dev server. Business logic in these pages
        // is composed from tested components (Chat.tsx, AuthContext, sidebar,
        // message components). To test pages end-to-end, use Playwright or
        // next/testing-library with a running Next.js server — outside unit test scope.
        'src/app/**/*.{ts,tsx}',
      ],
    },
  },
});
