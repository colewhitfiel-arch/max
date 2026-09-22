import js from '@eslint/js';
import prettier from 'eslint-config-prettier';
import tseslint from 'typescript-eslint';

/** Базовые правила для любого TS-пакета. */
export const base = tseslint.config(
  {
    ignores: [
      'dist/**',
      'build/**',
      'coverage/**',
      'generated/**',
      'node_modules/**',
      // tsup на время сборки кладёт рядом временный бандл конфига; при параллельном lint в turbo
      // eslint успевает его увидеть, а файл уже удалён → ENOENT
      '**/tsup.config.bundled_*',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommended,
  {
    rules: {
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'no-console': ['warn', { allow: ['warn', 'error'] }],
      eqeqeq: ['error', 'smart'],
    },
  },
  prettier,
);

export default base;
