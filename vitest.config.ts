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
      // Set just below the measured level. Ratchet upward as tests are added; never lower them. Re-measured for
      // Vitest 5, whose AST-based remapping counts statements and branches more strictly than Vitest 3 did.
      thresholds: { statements: 90, branches: 82, functions: 93, lines: 91 },
    },
  },
});
