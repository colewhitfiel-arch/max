import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';
import tseslint from 'typescript-eslint';
import { base } from './base.js';

/** Правила для React-пакетов (web, ui). */
export const react = tseslint.config(...base, {
  files: ['**/*.{ts,tsx}'],
  plugins: { 'react-hooks': reactHooks },
  languageOptions: {
    globals: { ...globals.browser },
  },
  rules: {
    ...reactHooks.configs.recommended.rules,
  },
});

export default react;
