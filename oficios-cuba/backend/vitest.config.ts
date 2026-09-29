import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    globalSetup: ['./test/plantilla.ts'],
    setupFiles: ['./test/setup.ts'],
    // Cada archivo de test corre en su propio proceso con su propia base,
    // creada desde la plantilla en beforeAll (ver test/setup.ts).
    pool: 'forks',
    testTimeout: 20_000,
  },
});
