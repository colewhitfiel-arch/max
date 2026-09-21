import { defineConfig } from 'tsup';

export default defineConfig({
  entry: { index: 'src/index.ts', 'fixtures/index': 'src/fixtures/index.ts' },
  format: ['esm', 'cjs'],
  dts: true,
  sourcemap: true,
  clean: true,
  splitting: false,
  treeshake: true,
  external: ['zod', '@ts-rest/core'],
});
