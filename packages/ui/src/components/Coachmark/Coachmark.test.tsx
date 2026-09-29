import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Coachmark, type CoachmarkProps } from './Coachmark';
import { placeCoachmark } from './placement';

function renderCoachmark(props: Partial<CoachmarkProps> = {}) {
  const handlers = { onNext: vi.fn(), onPrev: vi.fn(), onClose: vi.fn() };
  const view = render(
    <Coachmark
      open
      target={{ top: 100, left: 20, width: 200, height: 60 }}
      title="Расписание"
      step={2}
      total={5}
      {...handlers}
      {...props}
    >
      Занятия на выбранный день
    </Coachmark>,
  );
  return { ...view, ...handlers };
}

describe('Coachmark', () => {
  it('диалог с заголовком, текстом и счётчиком; кнопки вызывают обработчики', async () => {
    const { onNext, onPrev, onClose } = renderCoachmark({ eyebrow: 'Ученик' });
    const dialog = screen.getByRole('dialog', { name: /Расписание/ });
    expect(dialog).toHaveAccessibleDescription('Занятия на выбранный день');
    expect(dialog).toHaveTextContent('Ученик');
    expect(dialog).toHaveTextContent('2/5');
    expect(screen.getByText('Шаг 2 из 5')).toBeInTheDocument();

    await userEvent.click(screen.getByRole('button', { name: 'Далее' }));
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }));
    await userEvent.click(screen.getByRole('button', { name: 'Закрыть' }));
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('фокус на «Далее»; клавиши: → дальше, ← назад, Escape закрывает', async () => {
    const { onNext, onPrev, onClose } = renderCoachmark();
    expect(screen.getByRole('button', { name: 'Далее' })).toHaveFocus();
    await userEvent.keyboard('{ArrowRight}{ArrowLeft}{Escape}');
    expect(onNext).toHaveBeenCalledTimes(1);
    expect(onPrev).toHaveBeenCalledTimes(1);
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('первый шаг: «Завершить» вместо «Назад», ← не работает; последний — «Готово»', async () => {
    const { onPrev, onClose, rerender, onNext } = renderCoachmark({ step: 1 });
    expect(screen.queryByRole('button', { name: 'Назад' })).toBeNull();
    await userEvent.keyboard('{ArrowLeft}');
    expect(onPrev).not.toHaveBeenCalled();
    await userEvent.click(screen.getByRole('button', { name: 'Завершить' }));
    expect(onClose).toHaveBeenCalledTimes(1);

    rerender(
      <Coachmark
        open
        target={null}
        title="Готово"
        step={5}
        total={5}
        onNext={onNext}
        onPrev={onPrev}
        onClose={onClose}
        doneLabel="Закончить тур"
      />,
    );
    await userEvent.click(screen.getByRole('button', { name: 'Закончить тур' }));
    expect(onNext).toHaveBeenCalledTimes(1);
  });

  it('busy: спиннер вместо карточки, стрелки не листают, Escape закрывает', async () => {
    const { onNext, onClose } = renderCoachmark({ busy: true, busyLabel: 'Открываем экран' });
    expect(screen.queryByRole('dialog')).toBeNull();
    expect(screen.getByRole('status', { name: 'Открываем экран' })).toBeInTheDocument();
    await userEvent.keyboard('{ArrowRight}{Escape}');
    expect(onNext).not.toHaveBeenCalled();
    expect(onClose).toHaveBeenCalledTimes(1);
  });

  it('interactive: щит вокруг «окна» (клики внутри проходят), без него — на весь экран', async () => {
    const { rerender, onNext, onPrev, onClose } = renderCoachmark();
    await waitFor(() =>
      expect(document.querySelector('.ui-coachmark__spotlight[data-empty]')).toBeNull(),
    );
    expect(document.querySelectorAll('.ui-coachmark__shield')).toHaveLength(1);

    rerender(
      <Coachmark
        open
        interactive
        target={{ top: 100, left: 20, width: 200, height: 60 }}
        title="Расписание"
        step={2}
        total={5}
        onNext={onNext}
        onPrev={onPrev}
        onClose={onClose}
      />,
    );
    expect(document.querySelectorAll('.ui-coachmark__shield')).toHaveLength(4);
  });

  it('стрелки и Escape при вводе в поле не листают и не закрывают тур', async () => {
    const { onNext, onClose } = renderCoachmark({ interactive: true });
    const input = document.createElement('input');
    document.body.append(input);
    input.focus();
    await userEvent.keyboard('{ArrowRight}{Escape}');
    expect(onNext).not.toHaveBeenCalled();
    expect(onClose).not.toHaveBeenCalled();
    input.remove();
  });

  it('open={false} — ничего не рендерит и не слушает клавиши', async () => {
    const { onClose } = renderCoachmark({ open: false });
    expect(document.querySelector('.ui-coachmark')).toBeNull();
    await userEvent.keyboard('{Escape}');
    expect(onClose).not.toHaveBeenCalled();
  });
});

describe('placeCoachmark', () => {
  const viewport = { width: 390, height: 844 };
  const card = { width: 358, height: 200 };
  const options = { margin: 16, gap: 14, padding: 8 };

  it('без цели — по центру экрана без подсветки и стрелки', () => {
    expect(placeCoachmark(null, card, viewport, options)).toEqual({
      spotlight: null,
      top: 322,
      left: 16,
      side: 'center',
      arrowX: null,
    });
  });

  it('под целью, если снизу хватает места; стрелка — на центре цели', () => {
    const placement = placeCoachmark(
      { top: 100, left: 20, width: 100, height: 50 },
      card,
      viewport,
      options,
    );
    expect(placement.spotlight).toEqual({ top: 92, left: 12, width: 116, height: 66 });
    expect(placement.side).toBe('bottom');
    expect(placement.top).toBe(172);
    expect(placement.left).toBe(16);
    expect(placement.arrowX).toBe(54);
  });

  it('над целью, если снизу места нет', () => {
    const placement = placeCoachmark(
      { top: 700, left: 20, width: 350, height: 80 },
      card,
      viewport,
      options,
    );
    expect(placement.side).toBe('top');
    expect(placement.top).toBe(692 - 14 - 200);
  });

  it('цель почти на весь экран — карточка у нижнего края поверх подсветки, без стрелки', () => {
    const placement = placeCoachmark(
      { top: 40, left: 0, width: 390, height: 760 },
      card,
      viewport,
      options,
    );
    expect(placement.side).toBe('overlay');
    expect(placement.top).toBe(844 - 16 - 200);
    expect(placement.arrowX).toBeNull();
    // Подсветка обрезана по краям экрана.
    expect(placement.spotlight).toEqual({ top: 32, left: 0, width: 390, height: 776 });
  });

  it('overlaySide="top" — не влезшая карточка у верхнего края', () => {
    const placement = placeCoachmark(
      { top: 40, left: 0, width: 390, height: 760 },
      card,
      viewport,
      { ...options, overlaySide: 'top' },
    );
    expect(placement.side).toBe('overlay');
    expect(placement.top).toBe(16);
  });

  it('цель за пределами экрана — как шаг без цели', () => {
    const placement = placeCoachmark(
      { top: 900, left: 20, width: 100, height: 50 },
      card,
      viewport,
      options,
    );
    expect(placement.side).toBe('center');
    expect(placement.spotlight).toBeNull();
  });
});
