import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    // Core, engine and analytics are pure and must be testable without a DOM.
    environment: 'node',
    include: ['tests/**/*.test.ts'],
    // No test may depend on a live network or a model API. Providers are stubbed
    // or the deterministic tier is exercised directly.
    testTimeout: 30_000,
  },
});
