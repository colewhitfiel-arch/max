/**
 * «Моя траектория» сворачивается и раскрывается кнопкой в заголовке: по умолчанию свёрнута,
 * шеврон с `aria-expanded` показывает содержимое и прячет его обратно.
 */
import { ToastProvider } from '@edu/ui';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import type * as AiEntity from '@/entities/ai';
import '@/shared/i18n';
import { TrajectoryCard } from './TrajectoryCard';

const trajectory = {
  id: '0190a000-0000-7000-8000-000000000301',
  studentId: '0190a000-0000-7000-8000-000000000021',
  generatedAt: '2026-09-27T10:00:00.000Z',
  promptId: 'trajectory@1',
  content: {
    summary: 'Сильная сторона — практика и проекты.',
    strengths: ['Логика'],
    growthAreas: ['Регулярность'],
    recommendations: [{ title: 'Шахматы', why: 'Разовьют стратегию' }],
    nextSteps: ['Сдать задачи по Python'],
  },
};

vi.mock('@/entities/ai', async (importOriginal) => ({
  ...(await importOriginal<typeof AiEntity>()),
  useTrajectory: () => ({
    data: trajectory,
    error: null,
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
  useRefreshTrajectory: () => ({ mutate: vi.fn(), isPending: false }),
}));

describe('TrajectoryCard', () => {
  it('свёрнута по умолчанию; кнопка раскрывает и снова скрывает траекторию', async () => {
    const user = userEvent.setup();
    render(
      <ToastProvider>
        <TrajectoryCard />
      </ToastProvider>,
    );

    expect(screen.getByRole('heading', { name: 'Моя траектория' })).toBeVisible();
    const expand = screen.getByRole('button', { name: 'Показать траекторию' });
    expect(expand).toHaveAttribute('aria-expanded', 'false');
    expect(screen.queryByText('Сильная сторона — практика и проекты.')).not.toBeInTheDocument();
    // Пересчёт — только в раскрытом виде.
    expect(screen.queryByRole('button', { name: 'Обновить' })).not.toBeInTheDocument();

    await user.click(expand);
    const collapse = screen.getByRole('button', { name: 'Скрыть траекторию' });
    expect(collapse).toHaveAttribute('aria-expanded', 'true');
    expect(screen.getByText('Сильная сторона — практика и проекты.')).toBeVisible();
    expect(screen.getByRole('button', { name: 'Обновить' })).toBeVisible();

    await user.click(collapse);
    expect(screen.getByRole('button', { name: 'Показать траекторию' })).toBeVisible();
    expect(screen.queryByText('Сильная сторона — практика и проекты.')).not.toBeInTheDocument();
  });
});
