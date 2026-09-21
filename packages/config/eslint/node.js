import globals from 'globals';
import tseslint from 'typescript-eslint';
import { base } from './base.js';

/** Правила для Node-пакетов (api, db, ai, contracts). */
export const node = tseslint.config(...base, {
  languageOptions: {
    globals: { ...globals.node },
  },
  rules: {
    // NestJS активно использует классы-декораторы с пустыми конструкторами
    '@typescript-eslint/no-empty-object-type': 'off',
    '@typescript-eslint/no-extraneous-class': 'off',
    'no-console': 'off',
  },
});

export default node;
