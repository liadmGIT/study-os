import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    environment: 'node',
    env: { TZ: 'Asia/Jerusalem', DISABLE_SCHEDULER: '1' },
    testTimeout: 20000,
    fileParallelism: false,
    setupFiles: ['./test/setup.ts'],
  },
});
