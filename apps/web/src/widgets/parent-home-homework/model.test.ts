import { describe, expect, it } from 'vitest';
import { BUBBLE_MAX_SIZE, BUBBLE_MIN_SIZE, bubbleSize } from './model';

describe('bubbleSize', () => {
  it('ничего не сделано — максимальный круг', () => {
    expect(bubbleSize(0, 45)).toBe(BUBBLE_MAX_SIZE);
    expect(bubbleSize(0, 0)).toBe(BUBBLE_MAX_SIZE);
  });

  it('чем больше сделано, тем меньше круг (линейно по доле)', () => {
    expect(bubbleSize(28, 45)).toBeLessThan(bubbleSize(10, 45));
    expect(bubbleSize(15, 30)).toBe((BUBBLE_MAX_SIZE + BUBBLE_MIN_SIZE) / 2);
  });

  it('сделано всё рекомендованное или больше — минимальный круг', () => {
    expect(bubbleSize(30, 30)).toBe(BUBBLE_MIN_SIZE);
    expect(bubbleSize(100, 30)).toBe(BUBBLE_MIN_SIZE);
  });

  it('без рекомендованных: что-то сделано — минимальный', () => {
    expect(bubbleSize(3, 0)).toBe(BUBBLE_MIN_SIZE);
  });
});
