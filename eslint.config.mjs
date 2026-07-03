import js from '@eslint/js';
import globals from 'globals';

export default [
  js.configs.recommended,
  {
    // Page + worker scripts, loaded as plain <script>/importScripts — they share one
    // global scope, so data.js/mixing.js declarations are cross-file globals here.
    files: ['js/**/*.js'],
    languageOptions: {
      sourceType: 'script',
      globals: {
        ...globals.browser,
        ...globals.worker,
        BASE_EFFECTS: 'readonly',
        STRAIN_DEFAULTS: 'readonly',
        INGREDIENTS: 'readonly',
        TRANSFORMS: 'readonly',
        ALL_EFFECTS: 'readonly',
        TRANSFORM_MAP: 'readonly',
        search: 'readonly',
        applyIngredient: 'readonly',
      },
    },
    rules: {
      // Top-level declarations are this project's cross-<script> "exports";
      // only flag unused locals, and let data.js/mixing.js declare the globals
      // listed above without tripping no-redeclare.
      'no-unused-vars': ['error', { vars: 'local' }],
      'no-redeclare': ['error', { builtinGlobals: false }],
    },
  },
  {
    files: ['tests/**/*.js'],
    languageOptions: { sourceType: 'commonjs', globals: globals.node },
  },
];
