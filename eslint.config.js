// @ts-check
/**
 * Configuration ESLint (format « flat »).
 *
 * - typescript-eslint avec vérification de types ;
 * - règles des hooks React ;
 * - dépendances autorisées entre dossiers de `src/` (docs/10-conventions-code.md) ;
 * - TSDoc obligatoire sur tout export de `src/` (CLAUDE.md, définition de « terminé »).
 */
import js from '@eslint/js';
import importPlugin from 'eslint-plugin-import';
import jsdoc from 'eslint-plugin-jsdoc';
import reactHooks from 'eslint-plugin-react-hooks';
import globals from 'globals';
import tseslint from 'typescript-eslint';

/** Dossiers de `src/` et ce que chacun n'a PAS le droit d'importer. */
const forbiddenImports = [
  {
    target: './src/core',
    from: ['sims', 'engine', 'content', 'game', 'ui', 'app', 'platform', 'audio'],
  },
  { target: './src/sims', from: ['engine', 'content', 'game', 'ui', 'app', 'platform', 'audio'] },
  {
    target: './src/content',
    from: ['sims', 'engine', 'game', 'ui', 'app', 'platform', 'audio'],
  },
  { target: './src/engine', from: ['game', 'ui', 'app', 'platform', 'audio'] },
  { target: './src/game', from: ['ui', 'app', 'sims'] },
  { target: './src/ui', from: ['game', 'app'] },
  { target: './src/platform', from: ['engine', 'sims', 'content', 'game', 'ui', 'app', 'audio'] },
  { target: './src/audio', from: ['engine', 'sims', 'content', 'game', 'ui', 'app'] },
];

export default tseslint.config(
  {
    ignores: [
      'dist',
      'dev-dist',
      'coverage',
      'node_modules',
      'reference',
      'src/content/generated',
      'playwright-report',
      'test-results',
    ],
  },
  js.configs.recommended,
  ...tseslint.configs.recommendedTypeChecked,
  {
    languageOptions: {
      ecmaVersion: 2023,
      globals: { ...globals.browser, ...globals.node },
      parserOptions: {
        project: ['./tsconfig.json', './tsconfig.node.json'],
        tsconfigRootDir: import.meta.dirname,
      },
    },
    plugins: { import: importPlugin, 'react-hooks': reactHooks },
    settings: {
      'import/resolver': {
        typescript: {
          project: ['./tsconfig.json', './tsconfig.node.json'],
          noWarnOnMultipleProjects: true,
        },
      },
    },
    rules: {
      ...reactHooks.configs.recommended.rules,
      '@typescript-eslint/no-explicit-any': 'error',
      '@typescript-eslint/consistent-type-imports': 'error',
      '@typescript-eslint/no-unused-vars': [
        'error',
        { argsIgnorePattern: '^_', varsIgnorePattern: '^_' },
      ],
      '@typescript-eslint/switch-exhaustiveness-check': 'error',
      'import/no-restricted-paths': [
        'error',
        {
          zones: forbiddenImports.flatMap(({ target, from }) =>
            from.map((dir) => ({
              target,
              from: `./src/${dir}`,
              message: `Dépendance interdite : ${target.slice(2)} ne peut pas importer src/${dir} (docs/10-conventions-code.md).`,
            })),
          ),
        },
      ],
      'no-console': ['warn', { allow: ['warn', 'error'] }],
    },
  },
  {
    // L'interface ne peut importer des simulateurs que des types (docs/10).
    files: ['src/ui/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-restricted-imports': [
        'error',
        {
          patterns: [
            {
              group: ['@sims/*', '**/sims/**'],
              allowTypeImports: true,
              message: "src/ui n'importe que des types depuis src/sims.",
            },
          ],
        },
      ],
    },
  },
  {
    // TSDoc obligatoire sur tout export du code source.
    files: ['src/**/*.{ts,tsx}'],
    ignores: ['src/**/*.test.{ts,tsx}'],
    plugins: { jsdoc },
    rules: {
      'jsdoc/require-jsdoc': [
        'error',
        {
          publicOnly: { esm: true },
          require: {
            FunctionDeclaration: true,
            ClassDeclaration: true,
            ArrowFunctionExpression: true,
            FunctionExpression: true,
          },
          contexts: ['TSInterfaceDeclaration', 'TSTypeAliasDeclaration', 'TSEnumDeclaration'],
        },
      ],
    },
  },
  {
    files: ['**/*.test.{ts,tsx}', 'tests/**/*.{ts,tsx}'],
    rules: {
      '@typescript-eslint/no-non-null-assertion': 'off',
      '@typescript-eslint/unbound-method': 'off',
    },
  },
  {
    files: ['**/*.js'],
    ...tseslint.configs.disableTypeChecked,
  },
  {
    files: ['scripts/**/*.ts'],
    rules: { 'no-console': 'off' },
  },
);
