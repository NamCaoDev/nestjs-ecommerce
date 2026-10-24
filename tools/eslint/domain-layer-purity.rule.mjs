import FORBIDDEN_DOMAIN_PACKAGES from './forbidden-domain-packages.mjs';

/** Outer layers the Domain Layer must not depend on (dependency rule points inwards). */
const FORBIDDEN_DOMAIN_LAYERS = [
  '**/application/**',
  '**/infrastructure/**',
  '**/presentation/**',
  '**/core/**',
];

/**
 * ESLint rule set enforcing a pure-TypeScript Domain Layer.
 * Apply it to `apps/<service>/src/domain/**` and to every `type:domain` library.
 */
export default {
  'no-restricted-imports': [
    'error',
    {
      patterns: [
        {
          group: FORBIDDEN_DOMAIN_PACKAGES,
          message:
            'Domain Layer must be pure TypeScript: no framework or infrastructure imports (CLAUDE.md §3).',
        },
        {
          group: FORBIDDEN_DOMAIN_LAYERS,
          message:
            'Domain Layer must not depend on outer layers (application/infrastructure/presentation/core).',
        },
      ],
    },
  ],
};
