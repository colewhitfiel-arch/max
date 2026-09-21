// Матчеры jest-dom для vitest (toBeInTheDocument, toHaveAttribute и т.д.).
import '@testing-library/jest-dom/vitest';
import { cleanup } from '@testing-library/react';
import { afterEach } from 'vitest';

// Без vitest `globals` Testing Library не чистит DOM сама.
afterEach(() => {
  cleanup();
});

// jsdom не реализует matchMedia — нужен для темы (prefers-color-scheme).
if (typeof window !== 'undefined' && typeof window.matchMedia !== 'function') {
  window.matchMedia = (query: string): MediaQueryList => ({
    matches: false,
    media: query,
    onchange: null,
    addEventListener: () => {},
    removeEventListener: () => {},
    addListener: () => {},
    removeListener: () => {},
    dispatchEvent: () => false,
  });
}

/*
 * jsdom подменяет AbortController своим, а `Request` остаётся нодовским (undici) и отвергает
 * чужой AbortSignal («Expected signal to be an instance of AbortSignal»). React Router создаёт
 * такие Request при навигации data-роутера. Убираем несовместимый signal — для тестов он не нужен.
 */
if (typeof window !== 'undefined' && typeof globalThis.Request === 'function') {
  const NativeRequest = globalThis.Request;
  class CompatRequest extends NativeRequest {
    constructor(input: RequestInfo | URL, init?: RequestInit) {
      if (init?.signal) {
        const { signal: _signal, ...rest } = init;
        super(input, rest);
        return;
      }
      super(input, init);
    }
  }
  globalThis.Request = CompatRequest;
}
