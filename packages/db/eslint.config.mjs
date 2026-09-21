import { node } from '@edu/config/eslint/node';

export default [...node, { ignores: ['generated/**', 'scripts/**', 'vitest.config.ts'] }];
