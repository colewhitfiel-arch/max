import { describe, expect, it } from 'vitest';
import { axisTicks, niceCeil, niceWholeCeil, ratio, round2 } from './chart';

describe('chart helpers', () => {
  it('niceCeil — «круглый» верх оси с круглой серединой', () => {
    expect(niceCeil(6700)).toBe(10000);
    expect(niceCeil(5000)).toBe(5000);
    expect(niceCeil(12388)).toBe(20000);
    expect(niceCeil(23)).toBe(40);
    expect(niceCeil(0)).toBe(0);
    expect(niceCeil(Number.NaN)).toBe(0);
  });

  it('niceWholeCeil — целые верх и середина и при малых значениях', () => {
    // niceCeil здесь дал бы дробную середину: 5 → 2,5, 1 → 0,5, 0,5 → 0,25.
    expect(axisTicks(niceWholeCeil(0.5))).toEqual([0, 1, 2]);
    expect(axisTicks(niceWholeCeil(1))).toEqual([0, 1, 2]);
    expect(axisTicks(niceWholeCeil(3))).toEqual([0, 2, 4]);
    expect(axisTicks(niceWholeCeil(5))).toEqual([0, 5, 10]);
    expect(niceWholeCeil(10)).toBe(10);
    expect(niceWholeCeil(23)).toBe(40);
    expect(niceWholeCeil(6700)).toBe(10000);
    expect(niceWholeCeil(0)).toBe(0);
    expect(niceWholeCeil(-5)).toBe(0);
  });

  it('axisTicks, ratio, round2', () => {
    expect(axisTicks(10000)).toEqual([0, 5000, 10000]);
    expect(axisTicks(0)).toEqual([0]);
    expect(ratio(5, 0, 10)).toBe(0.5);
    expect(ratio(20, 0, 10)).toBe(1);
    expect(ratio(1, 0, 0)).toBe(0);
    expect(round2(33.33333)).toBe('33.33');
  });
});
