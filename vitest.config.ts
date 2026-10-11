import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The templates contain the generated project's own tests; they are not tests of the generator.
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
  },
});
