import nx from '@nx/eslint-plugin';
import prettier from 'eslint-config-prettier';
import FORBIDDEN_DOMAIN_PACKAGES from './tools/eslint/forbidden-domain-packages.mjs';
import domainLayerPurityRules from './tools/eslint/domain-layer-purity.rule.mjs';

export default [
  ...nx.configs['flat/base'],
  ...nx.configs['flat/typescript'],
  ...nx.configs['flat/javascript'],
  {
    ignores: [
      '**/dist',
      '**/out-tsc',
      '**/test-output',
      '**/node_modules',
      '**/prisma/generated',
    ],
  },
  {
    files: ['**/*.ts', '**/*.js'],
    rules: {
      '@nx/enforce-module-boundaries': [
        'error',
        {
          enforceBuildableLibDependency: true,
          allow: ['^.*/eslint(\\.base)?\\.config\\.[cm]?[jt]s$'],
          depConstraints: [
            {
              sourceTag: 'type:domain',
              onlyDependOnLibsWithTags: ['type:domain'],
              bannedExternalImports: FORBIDDEN_DOMAIN_PACKAGES,
            },
            {
              sourceTag: 'type:contracts',
              onlyDependOnLibsWithTags: ['type:contracts'],
              bannedExternalImports: FORBIDDEN_DOMAIN_PACKAGES,
            },
            {
              sourceTag: '*',
              onlyDependOnLibsWithTags: ['*'],
            },
          ],
        },
      ],
      '@typescript-eslint/no-explicit-any': 'error',
    },
  },
  {
    files: ['**/*.ts', '**/*.cts', '**/*.mts'],
    rules: {
      '@typescript-eslint/explicit-function-return-type': 'error',
      // CLAUDE.md requires explicit types on every variable, including literal initialisers.
      '@typescript-eslint/no-inferrable-types': 'off',
    },
  },
  {
    files: ['**/src/domain/**/*.ts'],
    rules: domainLayerPurityRules,
  },
  prettier,
];
