import { describe, expect, it } from 'vitest';
import { submissionTone } from './model';

describe('submissionTone — бейдж «N из M сдали»', () => {
  it.each([
    [0, 2, 'neutral'],
    [1, 2, 'info'],
    [2, 2, 'success'],
    [3, 2, 'success'],
    [0, 0, 'neutral'],
  ] as const)('%i из %i → %s', (submittedCount, studentsCount, tone) => {
    expect(submissionTone({ submittedCount, studentsCount })).toBe(tone);
  });
});
