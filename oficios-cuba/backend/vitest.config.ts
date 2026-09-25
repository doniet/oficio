import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    setupFiles: ['./test/setup.ts'],
    // Cada archivo de test corre en su propio proceso con su propia base de datos temporal.
    pool: 'forks',
  },
});
