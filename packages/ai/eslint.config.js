import { node } from '@edu/config/eslint/node';

export default [...node, { ignores: ['tsup.config.ts', 'vitest.config.ts'] }];
