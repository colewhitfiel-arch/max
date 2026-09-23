import type { GroupBrief } from '@edu/contracts';

/**
 * Короткая подпись группы для таблиц и графиков: номер из макета («001»), а если его нет —
 * название группы («Робототехника, группа А»).
 */
export function groupLabel(group: Pick<GroupBrief, 'title' | 'code'>): string {
  return group.code ?? group.title;
}
