import { defineConfig } from 'tsup';

export default defineConfig({
  entry: ['src/index.ts', 'src/worker.ts', 'src/scripts/seed.ts', 'src/scripts/create-admin.ts'],
  format: ['esm'],
  platform: 'node',
  target: 'node22',
  outDir: 'dist',
  clean: true,
  sourcemap: true,
  splitting: true,
  // Workspace packages export TypeScript source, so they must be bundled.
  noExternal: [/^@genpath\//],
});
