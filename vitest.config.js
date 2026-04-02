import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    globals: true,
    include: ['tests/**/*.test.js'],
    pool: 'forks',
    setupFiles: ['tests/helpers/mock-electron.js'],
  },
});
