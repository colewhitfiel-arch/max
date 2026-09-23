/**
 * Строка уведомления: без бейджа типа по умолчанию (узкая панель), «новое» — точка с
 * доступным именем, действие справа — только если передано.
 */
import type { NotificationDto } from '@edu/contracts';
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import '@/shared/i18n';
import { NotificationRow } from './NotificationRow';

const base: NotificationDto = {
  id: '0190a000-0000-7000-8000-000000000001',
  type: 'ASSIGNMENT_GRADED',
  title: 'Задание проверено',
  body: 'Робототехника',
  payload: null,
  readAt: '2026-09-22T10:00:00.000Z',
  createdAt: '2026-09-22T09:00:00.000Z',
};

describe('NotificationRow', () => {
  it('прочитанное: без бейджа типа и без метки «новое»', () => {
    render(<NotificationRow notification={base} />);
    expect(screen.getByText('Задание проверено')).toBeInTheDocument();
    // Раньше справа по умолчанию выводился тип — дублировал заголовок и ужимал текст.
    expect(screen.getAllByText('Задание проверено')).toHaveLength(1);
    expect(screen.queryByRole('img', { name: 'Новое' })).not.toBeInTheDocument();
  });

  it('непрочитанное: точка «Новое» доступна скринридеру, действие справа — переданное', () => {
    render(
      <NotificationRow
        notification={{ ...base, readAt: null }}
        right={<button type="button">Прочитано</button>}
      />,
    );
    expect(screen.getByRole('img', { name: 'Новое' })).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Прочитано' })).toBeInTheDocument();
  });
});
