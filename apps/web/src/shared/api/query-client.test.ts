import { describe, expect, it } from 'vitest';
import { ApiClientError } from './errors';
import { shouldRetry } from './query-client';

const err = (status: number, code: ConstructorParameters<typeof ApiClientError>[0]['code']) =>
  new ApiClientError({ status, code, message: 'x' });

describe('shouldRetry', () => {
  it('не повторяет ответы сервера 4xx и 501 «раздел в разработке»', () => {
    expect(shouldRetry(0, err(404, 'NOT_FOUND'))).toBe(false);
    expect(shouldRetry(0, err(403, 'FORBIDDEN'))).toBe(false);
    expect(shouldRetry(0, err(501, 'NOT_IMPLEMENTED'))).toBe(false);
  });

  it('повторяет сеть и 5xx не больше двух раз', () => {
    expect(shouldRetry(0, err(0, 'EXTERNAL_INTEGRATION'))).toBe(true);
    expect(shouldRetry(1, err(500, 'INTERNAL'))).toBe(true);
    expect(shouldRetry(2, err(500, 'INTERNAL'))).toBe(false);
    expect(shouldRetry(0, new Error('boom'))).toBe(true);
  });
});
