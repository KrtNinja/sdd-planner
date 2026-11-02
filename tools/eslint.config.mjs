// ESLint только со встроенными правилами — замер, а не стиль: сложность, размеры, вложенность.
// Пороги — целевые из REFACTORING.md; гейт сравнивает число нарушений с базовой линией (не больше).
export default [
  {
    files: ['**/*.mjs'],
    languageOptions: {
      ecmaVersion: 'latest',
      sourceType: 'module',
      globals: { process: 'readonly', console: 'readonly', URL: 'readonly', Buffer: 'readonly' },
    },
    rules: {
      complexity: ['warn', 10],
      'max-depth': ['warn', 4],
      'max-params': ['warn', 4],
      'max-statements': ['warn', 20],
      'max-lines-per-function': ['warn', { max: 40, skipBlankLines: true, skipComments: true }],
      'max-nested-callbacks': ['warn', 3],
      'max-len': ['warn', { code: 160 }],
      'no-nested-ternary': 'warn',
      'no-unused-vars': ['warn', { args: 'after-used' }],
      'no-param-reassign': 'warn',
      'no-shadow': 'warn',
      'prefer-const': 'warn',
      'no-undef': 'error',
    },
  },
];
