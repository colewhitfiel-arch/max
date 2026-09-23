import { act, render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { afterEach, describe, expect, it, vi } from 'vitest';
import { CodeBlock } from './CodeBlock';

const PYTHON = `def control_robot(distance):
    if distance <= 15:
        __________()
    else:
        move_forward()  # едем дальше
    print("Robot stopped")`;

const CPP = `#include <Servo.h>
int front = readDistance(FRONT);
// стоп
if (front < 20) { stopMotors(); } else { ____________; }`;

function tokens(container: HTMLElement, type: string): string[] {
  return [...container.querySelectorAll(`[data-token="${type}"]`)].map(
    (node) => node.textContent ?? '',
  );
}

describe('CodeBlock', () => {
  afterEach(() => {
    vi.useRealTimers();
    vi.restoreAllMocks();
  });

  it('сохраняет код как есть и подсвечивает python', () => {
    const { container } = render(<CodeBlock code={PYTHON} language="python" />);
    expect(container.querySelector('code')?.textContent).toBe(PYTHON);
    expect(tokens(container, 'keyword')).toEqual(['def']);
    expect(tokens(container, 'control')).toEqual(['if', 'else']);
    expect(tokens(container, 'function')).toEqual(['control_robot', 'move_forward', 'print']);
    expect(tokens(container, 'identifier')).toEqual(['distance', 'distance']);
    expect(tokens(container, 'number')).toEqual(['15']);
    expect(tokens(container, 'string')).toEqual(['"Robot stopped"']);
    expect(tokens(container, 'comment')).toEqual(['# едем дальше']);
  });

  it('подсвечивает cpp: типы, директивы, комментарии; пропуск «____» не подсвечен', () => {
    const { container } = render(<CodeBlock code={CPP} language="cpp" />);
    expect(tokens(container, 'keyword')).toEqual(['int']);
    expect(tokens(container, 'control')).toEqual(['#include', 'if', 'else']);
    expect(tokens(container, 'string')).toEqual(['<Servo.h>']);
    expect(tokens(container, 'function')).toEqual(['readDistance', 'stopMotors']);
    expect(tokens(container, 'identifier')).toEqual(['front', 'FRONT', 'front']);
    expect(tokens(container, 'comment')).toEqual(['// стоп']);
    expect(tokens(container, 'number')).toEqual(['20']);
    expect(container.querySelector('code')?.textContent).toBe(CPP);
  });

  it('cpp собирается без lookbehind (Safari/iOS < 16.4 его не знает): #include <…> — строка', async () => {
    // Свежий модуль (кэш лексеров пустой), а RegExp падает на lookbehind, как старый Safari.
    vi.resetModules();
    vi.stubGlobal(
      'RegExp',
      new Proxy(RegExp, {
        construct(target, args: [string | RegExp, string?]) {
          if (/\(\?<[=!]/.test(String(args[0]))) throw new SyntaxError('lookbehind');
          return Reflect.construct(target, args) as RegExp;
        },
      }),
    );
    try {
      const { tokenizeCode } = await import('./highlight');
      const code = '#  include\t<Wire.h>\n#define LED 13';
      const result = tokenizeCode(code, 'cpp');
      expect(result.map((token) => token.text).join('')).toBe(code);
      expect(result.filter((token) => token.type === 'control').map((t) => t.text)).toEqual([
        '#  include',
        '#define',
      ]);
      expect(result.filter((token) => token.type === 'string').map((t) => t.text)).toEqual([
        '<Wire.h>',
      ]);
    } finally {
      vi.unstubAllGlobals();
    }
  });

  it('language="text" — без подсветки', () => {
    const { container } = render(<CodeBlock code="if x: pass" />);
    expect(container.querySelector('[data-token]')).toBeNull();
    expect(container.querySelector('code')?.textContent).toBe('if x: pass');
  });

  it('«копировать» кладёт код в буфер и на время меняет подпись', async () => {
    const user = userEvent.setup();
    const writeText = vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    const onCopyResult = vi.fn();
    render(<CodeBlock code={PYTHON} language="python" onCopyResult={onCopyResult} />);

    await user.click(screen.getByRole('button', { name: 'копировать' }));
    expect(writeText).toHaveBeenCalledWith(PYTHON);
    expect(onCopyResult).toHaveBeenCalledWith(true);
    expect(await screen.findByRole('button', { name: 'скопировано' })).toBeInTheDocument();
    expect(screen.getByRole('status')).toHaveTextContent('скопировано');
  });

  it('подпись «скопировано» возвращается обратно через 2 секунды', async () => {
    vi.useFakeTimers({ shouldAdvanceTime: true });
    const user = userEvent.setup({ advanceTimers: vi.advanceTimersByTime });
    vi.spyOn(navigator.clipboard, 'writeText').mockResolvedValue(undefined);
    render(<CodeBlock code="x = 1" language="python" copyLabel="Копировать код" />);

    await user.click(screen.getByRole('button', { name: 'Копировать код' }));
    expect(await screen.findByRole('button', { name: 'скопировано' })).toBeInTheDocument();
    await act(async () => {
      vi.advanceTimersByTime(2000);
    });
    expect(screen.getByRole('button', { name: 'Копировать код' })).toBeInTheDocument();
  });
});
