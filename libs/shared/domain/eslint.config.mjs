import baseConfig from '../../../eslint.config.mjs';
import domainLayerPurityRules from '../../../tools/eslint/domain-layer-purity.rule.mjs';

export default [
  ...baseConfig,
  {
    files: ['**/*.ts'],
    rules: domainLayerPurityRules,
  },
];
