import js from '@eslint/js';
import nextVitals from 'eslint-config-next/core-web-vitals';
import { defineConfig, globalIgnores } from 'eslint/config';
import globals from 'globals';
import tseslint from 'typescript-eslint';

const WEB_FILES = 'apps/web/**/*.{js,jsx,mjs,ts,tsx}';

// eslint-config-next targets a single app; scope its rules to apps/web.
const nextForWeb = nextVitals
  .filter((config) => !config.ignores || config.rules || config.plugins)
  .map((config) => ({ ...config, files: [WEB_FILES] }));

export default defineConfig(
  globalIgnores([
    '**/node_modules/**',
    '**/dist/**',
    '**/.next/**',
    '**/coverage/**',
    '**/next-env.d.ts',
    '.data/**',
    'pnpm-lock.yaml',
  ]),
  js.configs.recommended,
  tseslint.configs.recommended,
  {
    languageOptions: {
      ecmaVersion: 2023,
      sourceType: 'module',
      globals: { ...globals.node },
    },
    rules: {
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_', caughtErrorsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/consistent-type-imports': ['error', { fixStyle: 'inline-type-imports' }],
      eqeqeq: ['error', 'always', { null: 'ignore' }],
      'no-console': ['error', { allow: ['warn', 'error'] }],
    },
  },
  {
    files: ['**/*.{ts,tsx}'],
    languageOptions: {
      parserOptions: { projectService: true, tsconfigRootDir: import.meta.dirname },
    },
    rules: {
      '@typescript-eslint/no-floating-promises': 'error',
      '@typescript-eslint/no-misused-promises': [
        'error',
        { checksVoidReturn: { attributes: false } },
      ],
      '@typescript-eslint/await-thenable': 'error',
    },
  },
  ...nextForWeb,
  {
    files: [WEB_FILES],
    languageOptions: { globals: { ...globals.browser } },
    settings: { next: { rootDir: 'apps/web' } },
  },
  {
    // Classic Web Worker scripts served as static files.
    files: ['apps/web/public/workers/**/*.js'],
    languageOptions: { sourceType: 'script', globals: { ...globals.worker } },
  },
  {
    // CLI scripts may print to stdout.
    files: ['apps/api/src/scripts/**/*.ts', 'scripts/**/*.{js,mjs,ts}'],
    rules: { 'no-console': 'off' },
  },
);
