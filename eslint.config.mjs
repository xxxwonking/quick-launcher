import eslint from '@eslint/js'
import babelParser from '@babel/eslint-parser'
import globals from 'globals'

export default [
  {
    ignores: ['node_modules/**', 'dist/**', 'out/**', 'release/**', 'coverage/**'],
  },
  eslint.configs.recommended,
  {
    files: ['**/*.{ts,tsx,mts,cts}'],
    languageOptions: {
      parser: babelParser,
      parserOptions: {
        ecmaVersion: 'latest',
        sourceType: 'module',
        requireConfigFile: false,
        babelOptions: {
          parserOpts: {
            plugins: ['typescript', 'jsx'],
          },
        },
      },
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
    rules: {
      'no-undef': 'off',
      'no-unused-vars': 'off',
      'no-console': 'warn',
    },
  },
  {
    files: ['**/*.{js,mjs,cjs}'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: {
        ...globals.node,
        ...globals.browser,
      },
    },
  },
]
