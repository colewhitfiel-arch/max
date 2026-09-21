// Матчеры jest-dom для vitest (toBeDisabled, toHaveAttribute и т.д.).
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Без vitest `globals` Testing Library не находит afterEach и не чистит DOM сама.
afterEach(() => {
  cleanup();
});
