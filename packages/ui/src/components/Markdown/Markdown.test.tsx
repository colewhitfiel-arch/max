import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { describe, expect, it, vi } from 'vitest';
import { Markdown } from './Markdown';

const LESSON = `# Arduino

Плата **Arduino** — *маленький* компьютер. Команда \`digitalWrite\`.

## Что понадобится
- плата
- светодиод

1. Подключи плату
2. Загрузи скетч

\`\`\`cpp
void setup() {}
\`\`\`

Подробнее — [на сайте](https://arduino.cc).`;

describe('Markdown', () => {
  it('разметка — элементами, а не символами «#» и «**»', () => {
    const { container } = render(<Markdown source={LESSON} />);

    // По умолчанию «#» — h2 (h1 — заголовок экрана), «##» — h3.
    expect(screen.getByRole('heading', { level: 2, name: 'Arduino' })).toBeInTheDocument();
    expect(screen.getByRole('heading', { level: 3, name: 'Что понадобится' })).toBeInTheDocument();
    expect(container.textContent).not.toMatch(/[#*`]/);
    expect(container.querySelector('strong')).toHaveTextContent('Arduino');
    expect(container.querySelector('em')).toHaveTextContent('маленький');
    expect(container.querySelector('.ui-markdown__code')).toHaveTextContent('digitalWrite');

    const [bullets, steps] = screen.getAllByRole('list');
    expect(bullets!.tagName).toBe('UL');
    expect(steps!.tagName).toBe('OL');
    expect(screen.getAllByRole('listitem').map((item) => item.textContent)).toEqual([
      'плата',
      'светодиод',
      'Подключи плату',
      'Загрузи скетч',
    ]);

    // Блок кода — CodeBlock с подсветкой и кнопкой копирования.
    expect(container.querySelector('.ui-code-block')).toHaveAttribute('data-language', 'cpp');
    expect(container.querySelector('pre code')).toHaveTextContent('void setup() {}');
    expect(screen.getByRole('button', { name: 'копировать' })).toBeInTheDocument();
  });

  it('headingLevel задаёт уровень «#»; нумерация с 3 сохраняется', () => {
    render(<Markdown source={'# Раздел\n### Пункт\n\n3. третий'} headingLevel={3} />);
    expect(screen.getByRole('heading', { level: 3, name: 'Раздел' })).toHaveAttribute(
      'data-level',
      '1',
    );
    expect(screen.getByRole('heading', { level: 5, name: 'Пункт' })).toHaveAttribute(
      'data-level',
      '3',
    );
    expect(screen.getByRole('list')).toHaveAttribute('start', '3');
  });

  it('ссылка http(s): новая вкладка без opener; onLinkClick перехватывает переход', async () => {
    const user = userEvent.setup();
    const onLinkClick = vi.fn();
    const { rerender } = render(<Markdown source="[сайт](https://arduino.cc/ru)" />);
    const link = screen.getByRole('link', { name: 'сайт' });
    expect(link).toHaveAttribute('href', 'https://arduino.cc/ru');
    expect(link).toHaveAttribute('target', '_blank');
    expect(link).toHaveAttribute('rel', 'noopener noreferrer');

    rerender(<Markdown source="[сайт](https://arduino.cc/ru)" onLinkClick={onLinkClick} />);
    await user.click(screen.getByRole('link', { name: 'сайт' }));
    expect(onLinkClick).toHaveBeenCalledWith('https://arduino.cc/ru');
  });

  it('небезопасное не выполняется: HTML — текстом, javascript: и картинки — без ссылок', () => {
    const source =
      '<img src=x onerror="alert(1)"> <script>alert(2)</script>\n\n' +
      '[жми](javascript:alert(3)) ![схема](https://evil.ru/track.png)';
    const { container } = render(<Markdown source={source} />);
    expect(container.querySelector('img, script, a')).toBeNull();
    expect(container).toHaveTextContent('<img src=x onerror="alert(1)"> <script>alert(2)</script>');
    expect(container).toHaveTextContent('жми схема');
  });

  it('переносы строк абзаца — <br>, className и атрибуты — на корне', () => {
    const { container } = render(
      <Markdown source={'строка 1\nстрока 2'} className="extra" data-testid="md" />,
    );
    const root = screen.getByTestId('md');
    expect(root).toHaveClass('ui-markdown', 'extra');
    expect(container.querySelectorAll('p br')).toHaveLength(1);
  });

  it('подписи копирования кода передаются в CodeBlock', () => {
    render(<Markdown source={'```py\nx = 1\n```'} copyLabel="Copy" copiedLabel="Copied" />);
    expect(screen.getByRole('button', { name: 'Copy' })).toBeInTheDocument();
  });
});
