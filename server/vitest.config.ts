import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['tests/**/*.test.ts'],
    testTimeout: 20000,
    // Setup that seeds hundreds of topics (hook tests) is slow on Windows CI runners.
    hookTimeout: 60000,
  },
});
