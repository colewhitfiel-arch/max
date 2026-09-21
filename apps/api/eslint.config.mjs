import { node } from '@edu/config/eslint/node';

export default [
  ...node,
  { ignores: ['vitest.config.ts', 'dist/**'] },
  {
    rules: {
      // NestJS внедряет зависимости по типам конструктора (emitDecoratorMetadata):
      // `import type` стирает класс из метаданных и ломает DI. Правило выключено намеренно.
      '@typescript-eslint/consistent-type-imports': 'off',
    },
  },
  {
    files: ['src/modules/**/*.ts'],
    rules: {
      // Модуль не читает чужие таблицы напрямую и не импортирует внутренности других модулей.
      'no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: [
                '../*/*.repository',
                '../../modules/*/*.repository',
                '**/modules/*/*.repository',
              ],
              message:
                'Репозиторий другого модуля импортировать нельзя. Используй публичный сервис модуля (docs/08-dependencies.md §8.3).',
            },
          ],
        },
      ],
    },
  },
];
