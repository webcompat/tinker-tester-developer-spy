module.exports = {
  env: {
    browser: true,
    es6: true,
    webextensions: true
  },
  extends: [
    'eslint:recommended',
    'plugin:mozilla/recommended'
  ],
  plugins: [
    'json',
    'mozilla'
  ],
  root: true,
  rules: {
    'eqeqeq': 'error',
    'no-console': ['error', { allow: ['warn', 'error', 'trace', 'info'] }],
    'no-eval': 'off',
    'no-var': 'error',
    'one-var': ['error', 'never'],
    'prefer-const': 'error'
  }
};
