import tseslint from 'typescript-eslint';
import hooks from 'eslint-plugin-react-hooks';
export default tseslint.config(
  { ignores: ['dist/**', 'node_modules/**', 'src/api/schema.d.ts', 'src/api/validators.js', 'src/api/validators.d.ts', 'artifacts/**', 'playwright-report/**', 'test-results/**'] },
  ...tseslint.configs.recommended,
  { files: ['**/*.{ts,tsx}'], plugins: { 'react-hooks': hooks }, rules: {
    'react-hooks/rules-of-hooks': 'error', 'react-hooks/exhaustive-deps': 'warn',
    '@typescript-eslint/no-explicit-any': 'error'
  } },
);
