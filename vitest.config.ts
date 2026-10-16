import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // The templates contain the generated project's own tests; they are not tests of the generator.
    include: ['tests/**/*.test.ts'],
    testTimeout: 30_000,
    coverage: {
      provider: 'v8',
      include: ['generator/**/*.ts', 'scripts/**/*.ts'],
      // Packs, installs and checks a generated project; run by CI's smoke jobs, not the unit tests.
      exclude: ['scripts/smoke.ts'],
      reporter: ['text', 'html', 'lcov', 'json-summary'],
      reportsDirectory: './coverage',
      // Set just below the measured level. Ratchet upward as tests are added; never lower them.
      thresholds: { statements: 94, branches: 92, functions: 90, lines: 94 },
    },
  },
});
