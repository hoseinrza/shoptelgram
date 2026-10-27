import js from '@eslint/js';

export default [
  {
    ignores: ['node_modules/**', 'worker-configuration.d.ts', '.wrangler/**'],
  },
  js.configs.recommended,
  {
    files: ['scripts/**/*.mjs'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        console: 'readonly',
        process: 'readonly',
      },
    },
  },
  {
    files: ['src/**/*.js', 'test/**/*.js', 'scripts/**/*.mjs', '*.js'],
    languageOptions: {
      ecmaVersion: 2024,
      sourceType: 'module',
      globals: {
        // Workers runtime + Web standards
        console: 'readonly',
        fetch: 'readonly',
        crypto: 'readonly',
        URL: 'readonly',
        URLSearchParams: 'readonly',
        Request: 'readonly',
        Response: 'readonly',
        AbortSignal: 'readonly',
        TextEncoder: 'readonly',
        btoa: 'readonly',
        atob: 'readonly',
        setTimeout: 'readonly',
      },
    },
    rules: {
      'no-unused-vars': ['error', { argsIgnorePattern: '^_', varsIgnorePattern: '^_' }],
      'no-constant-binary-expression': 'error',
      eqeqeq: ['error', 'smart'],
    },
  },
];
