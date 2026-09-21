import swc from 'unplugin-swc';
import { defineConfig } from 'vitest/config';

// SWC нужен, чтобы в тестах работали декораторы NestJS с emitDecoratorMetadata (esbuild их не поддерживает).
export default defineConfig({
  plugins: [
    swc.vite({
      jsc: {
        parser: { syntax: 'typescript', decorators: true },
        transform: { decoratorMetadata: true, legacyDecorator: true },
        target: 'es2022',
      },
      module: { type: 'es6' },
    }),
  ],
  test: {
    include: ['src/**/*.test.ts', 'test/**/*.test.ts'],
    environment: 'node',
    globals: false,
    testTimeout: 30_000,
    hookTimeout: 60_000,
    fileParallelism: false,
    server: {
      // Собранные workspace-пакеты грузим как обычные node-модули (CJS/ESM из dist), не трансформируем
      deps: { external: [/[\\/]packages[\\/](contracts|db|ai)[\\/]dist[\\/]/] },
    },
  },
});
