import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { PageHeader } from './PageHeader';

const LONG_TITLE = 'Домашнее задание: схема с датчиком';

describe('PageHeader', () => {
  it('кнопка «Назад» по умолчанию и с backLabel (i18n)', async () => {
    const onBack = vi.fn();
    const { rerender } = render(<PageHeader title="Главная" onBack={onBack} />);
    await userEvent.click(screen.getByRole('button', { name: 'Назад' }));
    expect(onBack).toHaveBeenCalledTimes(1);

    rerender(<PageHeader title="Home" onBack={onBack} backLabel="Back" />);
    expect(screen.getByRole('button', { name: 'Back' })).toBeInTheDocument();
  });

  // Длинный заголовок не режется в DOM: до двух строк с многоточием после второй — это CSS
  // (`-webkit-line-clamp: 2`), текст целиком остаётся доступным именем `<h1>`.
  it.each([
    ['solid', {}],
    ['solid с «Назад» и действиями', { onBack: () => {}, actions: <button>Ещё</button> }],
    ['plain', { variant: 'plain' as const }],
    [
      'plain с «Назад» и действиями',
      { variant: 'plain' as const, onBack: () => {}, actions: <button>Ещё</button> },
    ],
  ])('%s: заголовок целиком в <h1>, подзаголовок отдельно', (_name, props) => {
    const { container } = render(
      <PageHeader title={LONG_TITLE} subtitle="Робототехника, группа А" {...props} />,
    );
    const heading = screen.getByRole('heading', { level: 1 });
    expect(heading).toHaveTextContent(LONG_TITLE);
    expect(heading).toHaveClass('ui-page-header__title');
    expect(heading).not.toHaveTextContent('Робототехника');
    expect(container.querySelector('.ui-page-header__subtitle')).toHaveTextContent(
      'Робототехника, группа А',
    );
  });

  it('plain держит боковые слоты и без «Назад»/действий — заголовок по центру', () => {
    const { container, rerender } = render(<PageHeader title="Курсы" variant="plain" />);
    expect(container.querySelector('.ui-page-header__lead')).toBeInTheDocument();
    expect(container.querySelector('.ui-page-header__actions')).toBeInTheDocument();

    rerender(<PageHeader title="Курсы" />);
    expect(container.querySelector('.ui-page-header__lead')).not.toBeInTheDocument();
    expect(container.querySelector('.ui-page-header__actions')).not.toBeInTheDocument();
  });
});
