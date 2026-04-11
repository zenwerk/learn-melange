import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['ui/__tests__/**/*.test.js'],
    environment: 'node',
  },
});
