import type { LessonDto } from '@edu/contracts';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { useState } from 'react';
import { describe, expect, it, vi } from 'vitest';
import '@/shared/i18n';
import { addDays, startOfDay } from '@/shared/lib/dates';
import { DaySchedule, type DayScheduleProps } from './DaySchedule';

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

/** Расписание со своим состоянием дня — как на главной. */
function Harness(props: Partial<DayScheduleProps> & { lessons: LessonDto[] }) {
  const [date, setDate] = useState(() => startOfDay());
  return <DaySchedule date={date} onDateChange={setDate} {...props} />;
}

describe('DaySchedule', () => {
  it('показывает занятия сегодня и листает дни вперёд (назад — не раньше сегодня)', async () => {
    const user = userEvent.setup();
    render(
      <Harness
        lessons={[lesson('l1', 0, 23), lesson('l2', 1, 10)]}
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

    await user.click(screen.getByRole('button', { name: 'Предыдущий день' }));
    await user.click(screen.getByRole('button', { name: 'Предыдущий день' }));
    expect(screen.getByText('Сегодня')).toBeInTheDocument();
  });

  it('колокольчик открывает уведомления, иконка календаря — шторку', async () => {
    const user = userEvent.setup();
    const onOpen = vi.fn();
    const onToggle = vi.fn();
    const { rerender } = render(
      <Harness lessons={[]} onOpenNotifications={onOpen} onToggleCalendar={onToggle} />,
    );
    expect(screen.getByText('Сегодня занятий нет')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Уведомления' }));
    expect(onOpen).toHaveBeenCalledTimes(1);

    const calendar = screen.getByRole('button', { name: 'Открыть календарь' });
    expect(calendar).toHaveAttribute('aria-expanded', 'false');
    await user.click(calendar);
    expect(onToggle).toHaveBeenCalledTimes(1);

    rerender(<Harness lessons={[]} calendarOpen onToggleCalendar={onToggle} />);
    expect(screen.getByRole('button', { name: 'Закрыть календарь' })).toHaveAttribute(
      'aria-expanded',
      'true',
    );
  });

  it('режим родителя: колонка «Репетитор» и «Добавить кружок» (в пустой день — кнопкой)', async () => {
    const user = userEvent.setup();
    const onAddClub = vi.fn();
    render(
      <Harness
        lessons={[lesson('l1', 0, 23)]}
        secondColumn={{ header: 'Репетитор', cell: (item) => item.group.teacher.user.lastName }}
        nameAction={{ label: 'Добавить кружок', onClick: onAddClub }}
      />,
    );
    const table = screen.getByRole('table', { name: 'Сегодня' });
    expect(table).toHaveTextContent('Репетитор');
    expect(table).toHaveTextContent('Иванова');
    expect(table).not.toHaveTextContent('Группа');
    await user.click(screen.getByRole('button', { name: 'Добавить кружок' }));
    expect(onAddClub).toHaveBeenCalledTimes(1);

    // Завтра занятий нет — действие остаётся кнопкой в пустом состоянии.
    await user.click(screen.getByRole('button', { name: 'Следующий день' }));
    expect(screen.getByText('В этот день занятий нет')).toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Добавить кружок' }));
    expect(onAddClub).toHaveBeenCalledTimes(2);
  });

  it('сбой загрузки дня: ошибка с повтором вместо «нет занятий», листать дни можно', async () => {
    const user = userEvent.setup();
    const onRetry = vi.fn();
    render(<Harness lessons={[lesson('l1', 0, 23)]} error={new Error('сеть')} onRetry={onRetry} />);
    expect(screen.getByText('Не удалось загрузить')).toBeInTheDocument();
    expect(screen.queryByRole('table')).not.toBeInTheDocument();
    expect(screen.queryByText('Сегодня занятий нет')).not.toBeInTheDocument();
    await user.click(screen.getByRole('button', { name: 'Повторить' }));
    expect(onRetry).toHaveBeenCalledTimes(1);
    await user.click(screen.getByRole('button', { name: 'Следующий день' }));
    expect(screen.getByText('Завтра')).toBeInTheDocument();
  });
});
