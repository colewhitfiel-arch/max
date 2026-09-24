/** Выбор ребёнка в ParentShell: только ACTIVE; PENDING/отвязанный не становится «текущим». */
import type { ChildBrief } from '@edu/contracts';
import { describe, expect, it } from 'vitest';
import { resolveSelectedChild } from './ParentShell';

const child = (id: string, linkStatus: ChildBrief['linkStatus']) =>
  ({ student: { id }, linkStatus }) as ChildBrief;

describe('resolveSelectedChild', () => {
  const items = [child('pending', 'PENDING'), child('a', 'ACTIVE'), child('b', 'ACTIVE')];

  it('выбранный ACTIVE остаётся', () => {
    expect(resolveSelectedChild(items, 'b')).toBe('b');
  });

  it('ничего не выбрано — первый ACTIVE, а не первый в списке', () => {
    expect(resolveSelectedChild(items, null)).toBe('a');
  });

  it('выбран не ACTIVE или пропавший ребёнок — сброс на первого ACTIVE', () => {
    expect(resolveSelectedChild(items, 'pending')).toBe('a');
    expect(resolveSelectedChild(items, 'gone')).toBe('a');
  });

  it('ни одного ACTIVE — никто', () => {
    expect(resolveSelectedChild([child('pending', 'PENDING')], 'pending')).toBeNull();
    expect(resolveSelectedChild([], null)).toBeNull();
  });
});
