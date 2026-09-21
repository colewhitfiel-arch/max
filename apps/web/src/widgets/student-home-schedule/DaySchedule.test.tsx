import type { LessonDto } from '@edu/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import '@/shared/i18n';
import { addDays } from '@/shared/lib/dates';
import { DaySchedule } from './DaySchedule';

const group = {
  id: 'g1',
  title: '001',
  club: { id: 'c1', title: 'Робототехника', category: 'ROBOTICS' as const, coverUrl: null },
  teacher: {
    id: 't1',
    user: { id: 'u1', firstName: 'Мария', lastName: 'Иванова', nickname: null, avatarUrl: null },
    photoUrl: null,
  },
};

function lesson(id: string, dayOffset: number, hour: number): LessonDto {
  const startsAt = addDays(new Date(), dayOffset);
  startsAt.setHours(hour, 0, 0, 0);
  const endsAt = new Date(startsAt.getTime() + 90 * 60_000);
  return {
    id,
    groupId: group.id,
    ruleId: null,
    startsAt: startsAt.toISOString(),
    endsAt: endsAt.toISOString(),
    topic: null,
    room: null,
    status: 'PLANNED',
    cancelReason: null,
    group,
    attendance: null,
  };
}

describe('DaySchedule', () => {
  it('показывает занятия сегодня и листает дни вперёд/назад в пределах недели', async () => {
    const user = userEvent.setup();
    render(
      <DaySchedule
        today={[lesson('l1', 0, 23)]}
        upcoming={[lesson('l2', 1, 10)]}
        unreadCount={5}
        onOpenNotifications={vi.fn()}
      />,
    );
    expect(screen.getByText('Сегодня')).toBeInTheDocument();
    expect(screen.getByRole('table', { name: 'Сегодня' })).toHaveTextContent('Робототехника');
    expect(screen.getByRole('button', { name: 'Предыдущий день' })).toBeDisabled();
    expect(screen.getByRole('button', { name: 'Уведомления: 5 непрочитанных' })).toBeVisible();

    await user.click(screen.getByRole('button', { name: 'Следующий день' }));
    expect(screen.getByText('Завтра')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Предыдущий день' })).toBeEnabled();

    await user.click(screen.getByRole('button', { name: 'Следующий день' }));
    expect(screen.getByText('В этот день занятий нет')).toBeInTheDocument();

    await user.click(screen.getByRole('button', { name: /Календарь/ }));
    expect(screen.getByText('Сегодня')).toBeInTheDocument();
  });

  it('открывает уведомления по колокольчику', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    render(<DaySchedule today={[]} upcoming={[]} onOpenNotifications={onOpen} />);
    expect(screen.getByText('Сегодня занятий нет')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Уведомления' }));
    expect(onOpen).toHaveBeenCalledTimes(1);
  });
});
