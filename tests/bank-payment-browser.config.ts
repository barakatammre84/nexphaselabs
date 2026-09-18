import { defineConfig } from 'vitest/config';
import base from '../vitest.config';

// Explicit opt-in: requires system Chromium, not credentials or a running store.
export default defineConfig({
  resolve: base.resolve,
  test: {
    environment: 'node',
    include: ['tests/bank-payment.browser.ts'],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});