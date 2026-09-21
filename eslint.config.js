// Корневой ESLint: только игноры. Реальные правила — в каждом пакете через @edu/config.
export default [
  {
    ignores: [
      '**/node_modules/**',
      '**/dist/**',
      '**/build/**',
      '**/.turbo/**',
      '**/coverage/**',
      '.data/**',
      'packages/db/generated/**',
    ],
  },
];
