import js from '@eslint/js';
import globals from 'globals';
import reactHooks from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['**/node_modules/**', '**/dist/**'] },

  js.configs.recommended,
  {
    rules: {
      'no-unused-vars': ['error', { ignoreRestSiblings: true, argsIgnorePattern: '^_' }],
    },
  },

  {
    files: ['apps/server/**/*.js', 'scripts/**/*.mjs', 'eslint.config.mjs'],
    languageOptions: { globals: globals.node },
  },

  // The demo shop is CommonJS so OpenTelemetry can patch its modules
  {
    files: ['demo/**/*.js'],
    languageOptions: { globals: globals.node, sourceType: 'commonjs' },
  },

  {
    files: ['apps/web/**/*.{js,jsx}'],
    languageOptions: {
      globals: globals.browser,
      parserOptions: { ecmaFeatures: { jsx: true } },
    },
    plugins: { 'react-hooks': reactHooks },
    rules: reactHooks.configs.recommended.rules,
  },
  {
    files: ['apps/web/public/**/*.js'],
    languageOptions: { sourceType: 'script' },
  },
];
