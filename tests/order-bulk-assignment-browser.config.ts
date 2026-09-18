import { defineConfig } from 'vitest/config';
import base from '../vitest.config';

export default defineConfig({
  resolve: base.resolve,
  test: {
    environment: 'node',
    include: ['tests/order-bulk-assignment.browser.ts'],
    testTimeout: 60_000,
    hookTimeout: 30_000,
    fileParallelism: false,
  },
});