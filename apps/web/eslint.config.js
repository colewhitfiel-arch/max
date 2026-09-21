import { react } from '@edu/config/eslint/react';

/**
 * Границы слоёв FSD-lite (docs/02 §2.8): app → pages → widgets → features → entities → shared.
 * Импорты только вниз; страницы одной роли не импортируют страницы другой.
 */
const layerAbove = (layers) =>
  layers.flatMap((layer) => [`@/${layer}/**`, `**/src/${layer}/**`, `**/${layer}/**/*`]);

function restrict(files, patterns, message) {
  return {
    files,
    rules: {
      'no-restricted-imports': ['error', { patterns: [{ group: patterns, message }] }],
    },
  };
}

export default [
  ...react,
  { ignores: ['dist/**', 'public/mockServiceWorker.js', 'vite.config.ts', 'vitest.config.ts'] },
  restrict(
    ['src/shared/**'],
    layerAbove(['entities', 'features', 'widgets', 'pages', 'app']),
    'shared не импортирует слои выше (entities/features/widgets/pages/app).',
  ),
  restrict(
    ['src/entities/**'],
    layerAbove(['features', 'widgets', 'pages', 'app']),
    'entities не импортирует features/widgets/pages/app.',
  ),
  restrict(
    ['src/features/**'],
    layerAbove(['widgets', 'pages', 'app']),
    'features не импортирует widgets/pages/app.',
  ),
  restrict(['src/widgets/**'], layerAbove(['pages', 'app']), 'widgets не импортирует pages/app.'),
  restrict(['src/pages/**'], layerAbove(['app']), 'pages не импортирует app.'),
  restrict(
    ['src/pages/student/**'],
    ['@/pages/parent/**', '@/pages/teacher/**', '**/pages/parent/**', '**/pages/teacher/**'],
    'Страницы ученика не импортируют страницы других ролей.',
  ),
  restrict(
    ['src/pages/parent/**'],
    ['@/pages/student/**', '@/pages/teacher/**', '**/pages/student/**', '**/pages/teacher/**'],
    'Страницы родителя не импортируют страницы других ролей.',
  ),
  restrict(
    ['src/pages/teacher/**'],
    ['@/pages/student/**', '@/pages/parent/**', '**/pages/student/**', '**/pages/parent/**'],
    'Страницы преподавателя не импортируют страницы других ролей.',
  ),
];
