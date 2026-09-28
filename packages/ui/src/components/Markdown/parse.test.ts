import { describe, expect, it } from 'vitest';
import { markdownToText, parseInline, parseMarkdown, safeHref } from './parse';

describe('parseMarkdown: блоки', () => {
  it('заголовки # … ###, глубже — как ###; пустой «#» пропускается', () => {
    expect(parseMarkdown('# Arduino\n## Датчики ##\n### Код\n#### Мелко\n#\n#хэштег')).toEqual([
      { type: 'heading', level: 1, children: [{ type: 'text', text: 'Arduino' }] },
      { type: 'heading', level: 2, children: [{ type: 'text', text: 'Датчики' }] },
      { type: 'heading', level: 3, children: [{ type: 'text', text: 'Код' }] },
      { type: 'heading', level: 3, children: [{ type: 'text', text: 'Мелко' }] },
      { type: 'paragraph', children: [{ type: 'text', text: '#хэштег' }] },
    ]);
  });

  it('абзацы разделяются пустой строкой, переносы внутри сохраняются', () => {
    expect(parseMarkdown('Первая строка\r\nвторая\n\n\nНовый абзац')).toEqual([
      {
        type: 'paragraph',
        children: [
          { type: 'text', text: 'Первая строка' },
          { type: 'break' },
          { type: 'text', text: 'вторая' },
        ],
      },
      { type: 'paragraph', children: [{ type: 'text', text: 'Новый абзац' }] },
    ]);
  });

  it('блок кода ``` с языком: содержимое как есть, разметка внутри не разбирается', () => {
    const source = 'Код:\n```Python\ndef f():\n    return **x**\n```\nПосле';
    expect(parseMarkdown(source)).toEqual([
      { type: 'paragraph', children: [{ type: 'text', text: 'Код:' }] },
      { type: 'code', language: 'python', text: 'def f():\n    return **x**' },
      { type: 'paragraph', children: [{ type: 'text', text: 'После' }] },
    ]);
  });

  it('незакрытый блок кода идёт до конца текста; ~~~ тоже ограждение', () => {
    expect(parseMarkdown('~~~\na < b\n```')).toEqual([
      { type: 'code', language: '', text: 'a < b\n```' },
    ]);
    expect(parseMarkdown('```js\nlet x')).toEqual([
      { type: 'code', language: 'js', text: 'let x' },
    ]);
  });

  it('маркированный и нумерованный списки, вложенность, продолжение пункта', () => {
    const source = [
      '- один',
      '  продолжение',
      '- два',
      '  1. вложенный',
      '  2. ещё',
      '',
      '- три',
      '',
      '3. номер три',
      '4) четыре',
    ].join('\n');
    expect(parseMarkdown(source)).toEqual([
      {
        type: 'list',
        ordered: false,
        start: 1,
        items: [
          {
            children: [
              { type: 'text', text: 'один' },
              { type: 'break' },
              { type: 'text', text: 'продолжение' },
            ],
            lists: [],
          },
          {
            children: [{ type: 'text', text: 'два' }],
            lists: [
              {
                type: 'list',
                ordered: true,
                start: 1,
                items: [
                  { children: [{ type: 'text', text: 'вложенный' }], lists: [] },
                  { children: [{ type: 'text', text: 'ещё' }], lists: [] },
                ],
              },
            ],
          },
          { children: [{ type: 'text', text: 'три' }], lists: [] },
        ],
      },
      {
        type: 'list',
        ordered: true,
        start: 3,
        items: [
          { children: [{ type: 'text', text: 'номер три' }], lists: [] },
          { children: [{ type: 'text', text: 'четыре' }], lists: [] },
        ],
      },
    ]);
  });

  it('список прерывает абзац; «* * *» и «---» — линия, «**жирный**» в начале строки — не пункт', () => {
    expect(parseMarkdown('Шаги:\n* первый\n\n* * *\n---\n**Итог**').map((b) => b.type)).toEqual([
      'paragraph',
      'list',
      'rule',
      'rule',
      'paragraph',
    ]);
  });

  it('цитата разбирается как вложенный текст', () => {
    expect(parseMarkdown('> **Важно:**\n> не спешить\n\nдальше')).toEqual([
      {
        type: 'quote',
        children: [
          {
            type: 'paragraph',
            children: [
              { type: 'strong', children: [{ type: 'text', text: 'Важно:' }] },
              { type: 'break' },
              { type: 'text', text: 'не спешить' },
            ],
          },
        ],
      },
      { type: 'paragraph', children: [{ type: 'text', text: 'дальше' }] },
    ]);
  });

  it('глубокая вложенность цитат и выделений не роняет разбор', () => {
    expect(() => parseMarkdown(`${'>'.repeat(5000)} x`)).not.toThrow();
    expect(() => parseInline(`${'*_'.repeat(3000)}x${'_*'.repeat(3000)}`)).not.toThrow();
  });
});

describe('parseInline: строчная разметка', () => {
  it('жирный, курсив (* и _), жирный курсив, код', () => {
    expect(parseInline('**ж** *к* _к_ __ж__ ***жк*** `a **b**`')).toEqual([
      { type: 'strong', children: [{ type: 'text', text: 'ж' }] },
      { type: 'text', text: ' ' },
      { type: 'em', children: [{ type: 'text', text: 'к' }] },
      { type: 'text', text: ' ' },
      { type: 'em', children: [{ type: 'text', text: 'к' }] },
      { type: 'text', text: ' ' },
      { type: 'strong', children: [{ type: 'text', text: 'ж' }] },
      { type: 'text', text: ' ' },
      { type: 'strong', children: [{ type: 'em', children: [{ type: 'text', text: 'жк' }] }] },
      { type: 'text', text: ' ' },
      { type: 'code', text: 'a **b**' },
    ]);
  });

  it('вложенное выделение: курсив внутри жирного и наоборот', () => {
    expect(parseInline('**a *b* c**')).toEqual([
      {
        type: 'strong',
        children: [
          { type: 'text', text: 'a ' },
          { type: 'em', children: [{ type: 'text', text: 'b' }] },
          { type: 'text', text: ' c' },
        ],
      },
    ]);
    expect(parseInline('*a **b** c*')).toEqual([
      {
        type: 'em',
        children: [
          { type: 'text', text: 'a ' },
          { type: 'strong', children: [{ type: 'text', text: 'b' }] },
          { type: 'text', text: ' c' },
        ],
      },
    ]);
  });

  it('не выделение: snake_case, «2 * 3 * 4», незакрытые и экранированные звёздочки', () => {
    expect(parseInline('snake_case_name')).toEqual([{ type: 'text', text: 'snake_case_name' }]);
    expect(parseInline('2 * 3 * 4')).toEqual([{ type: 'text', text: '2 * 3 * 4' }]);
    expect(parseInline('**нет конца')).toEqual([{ type: 'text', text: '**нет конца' }]);
    expect(parseInline('\\*буквально\\*')).toEqual([{ type: 'text', text: '*буквально*' }]);
  });

  it('ссылки http(s) — узлы link; прочие схемы и картинки — только текст', () => {
    expect(parseInline('[Arduino](https://arduino.cc/ru "сайт") и <http://example.com/a>')).toEqual(
      [
        {
          type: 'link',
          href: 'https://arduino.cc/ru',
          children: [{ type: 'text', text: 'Arduino' }],
        },
        { type: 'text', text: ' и ' },
        {
          type: 'link',
          href: 'http://example.com/a',
          children: [{ type: 'text', text: 'http://example.com/a' }],
        },
      ],
    );
    expect(
      parseInline('[жми](javascript:alert(1)) [файл](/files/1) ![схема](https://x.ru/a.png)'),
    ).toEqual([{ type: 'text', text: 'жми файл схема' }]);
    expect(parseInline('<javascript:alert(1)>')).toEqual([
      { type: 'text', text: '<javascript:alert(1)>' },
    ]);
  });

  it('ссылка со скобками в адресе и выделением в подписи', () => {
    expect(parseInline('[**Вики**](https://ru.wikipedia.org/wiki/Arduino_(платформа))')).toEqual([
      {
        type: 'link',
        href: 'https://ru.wikipedia.org/wiki/Arduino_(%D0%BF%D0%BB%D0%B0%D1%82%D1%84%D0%BE%D1%80%D0%BC%D0%B0)',
        children: [{ type: 'strong', children: [{ type: 'text', text: 'Вики' }] }],
      },
    ]);
  });

  it('сырой HTML остаётся текстом', () => {
    expect(parseInline('<img src=x onerror=alert(1)><b>x</b>')).toEqual([
      { type: 'text', text: '<img src=x onerror=alert(1)><b>x</b>' },
    ]);
  });
});

describe('safeHref', () => {
  it('пропускает только http(s)', () => {
    expect(safeHref(' https://max.ru/edu ')).toBe('https://max.ru/edu');
    expect(safeHref('HTTP://EXAMPLE.COM')).toBe('http://example.com/');
    for (const bad of [
      'javascript:alert(1)',
      'data:text/html,x',
      '//evil.ru',
      'mailto:a@b.ru',
      '',
    ]) {
      expect(safeHref(bad)).toBeNull();
    }
  });
});

describe('markdownToText', () => {
  it('убирает разметку для превью', () => {
    expect(
      markdownToText(
        '## Датчики\n\n**Ультразвуковой** датчик\nмеряет *расстояние*.\n\n- `trig`\n- [echo](https://x.ru)',
      ),
    ).toBe('Датчики Ультразвуковой датчик меряет расстояние. trig echo');
  });
});
