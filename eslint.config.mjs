import nextVitals from 'eslint-config-next/core-web-vitals';
import tsPlugin from '@typescript-eslint/eslint-plugin';
import reactHooksPlugin from 'eslint-plugin-react-hooks';

export default [
  { ignores: ['.next/**', '.tmp/**', 'node_modules/**', 'test-results/**', 'playwright-report/**'] },
  ...nextVitals,
  {
    plugins: { '@typescript-eslint': tsPlugin, 'react-hooks': reactHooksPlugin },
    rules: {
      '@typescript-eslint/no-unused-vars': ['warn', { argsIgnorePattern: '^_' }],
      '@typescript-eslint/no-explicit-any': 'warn',
      'react/no-unescaped-entities': 'off',
      'react-hooks/exhaustive-deps': 'warn',
    },
  },
];
