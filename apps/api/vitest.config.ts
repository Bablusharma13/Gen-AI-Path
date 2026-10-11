import { defineConfig } from 'vitest/config';

export default defineConfig({
  test: {
    include: ['test/**/*.test.ts', 'src/**/*.test.ts'],
    environment: 'node',
    // Each file gets its own MongoDB database, so files can run in parallel.
    pool: 'forks',
    // Every file boots the whole app; capping workers keeps cold-start setup within the hook timeout.
    maxWorkers: 4,
    testTimeout: 20_000,
    hookTimeout: 30_000,
  },
});
