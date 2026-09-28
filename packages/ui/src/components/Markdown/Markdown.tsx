import {
  createElement,
  forwardRef,
  useMemo,
  type HTMLAttributes,
  type MouseEvent,
  type ReactNode,
} from 'react';
import { cx } from '../../lib/cx';
import { CodeBlock, type CodeLanguage } from '../CodeBlock';
import {
  parseMarkdown,
  type MarkdownBlock,
  type MarkdownInline,
  type MarkdownListBlock,
} from './parse';
import './Markdown.css';

export interface MarkdownProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Текст в Markdown (учебный материал, ответ ИИ). Сырой HTML в нём выводится как текст. */
  source: string;
  /**
   * HTML-уровень заголовка `#`: `##` — на уровень ниже, `###`…`######` — на два. По умолчанию 2
   * (h1 — заголовок экрана). Размер шрифта зависит от числа `#`, а не от уровня.
   */
  headingLevel?: 1 | 2 | 3 | 4;
  /**
   * Нажатие на ссылку (только http(s)): свой способ открыть её — в MAX `bridge.openLink`.
   * Без обработчика — обычная ссылка в новой вкладке (`target="_blank"`, `rel="noopener noreferrer"`).
   */
  onLinkClick?: (href: string) => void;
  /** Подпись кнопки копирования у блоков кода (как у `CodeBlock`). По умолчанию «копировать». */
  copyLabel?: string;
  /** Подпись после копирования кода. По умолчанию «скопировано». */
  copiedLabel?: string;
  /** Результат копирования кода (например, тост при ошибке). */
  onCopyResult?: (ok: boolean) => void;
}

/** Язык из строки после ``` → подсветка `CodeBlock`; незнакомый — без подсветки. */
const CODE_LANGUAGES: Record<string, CodeLanguage> = {
  python: 'python',
  py: 'python',
  cpp: 'cpp',
  'c++': 'cpp',
  c: 'cpp',
  h: 'cpp',
  hpp: 'cpp',
  arduino: 'cpp',
  ino: 'cpp',
  javascript: 'javascript',
  js: 'javascript',
  jsx: 'javascript',
  typescript: 'javascript',
  ts: 'javascript',
};

type InlineOptions = Pick<MarkdownProps, 'onLinkClick'>;

function renderInline(nodes: MarkdownInline[], options: InlineOptions): ReactNode[] {
  return nodes.map((node, index) => {
    switch (node.type) {
      case 'text':
        return node.text;
      case 'break':
        return <br key={index} />;
      case 'code':
        return (
          <code key={index} className="ui-markdown__code">
            {node.text}
          </code>
        );
      case 'strong':
        return <strong key={index}>{renderInline(node.children, options)}</strong>;
      case 'em':
        return <em key={index}>{renderInline(node.children, options)}</em>;
      case 'link': {
        const { onLinkClick } = options;
        return (
          <a
            key={index}
            className="ui-markdown__link"
            href={node.href}
            target="_blank"
            rel="noopener noreferrer"
            onClick={
              onLinkClick
                ? (event: MouseEvent<HTMLAnchorElement>) => {
                    event.preventDefault();
                    onLinkClick(node.href);
                  }
                : undefined
            }
          >
            {renderInline(node.children, options)}
          </a>
        );
      }
    }
  });
}

interface BlockOptions extends InlineOptions {
  headingLevel: number;
  copyLabel?: string;
  copiedLabel?: string;
  onCopyResult?: (ok: boolean) => void;
}

function renderList(list: MarkdownListBlock, key: number, options: BlockOptions): ReactNode {
  const items = list.items.map((item, index) => (
    <li key={index}>
      {renderInline(item.children, options)}
      {item.lists.map((nested, nestedIndex) => renderList(nested, nestedIndex, options))}
    </li>
  ));
  return list.ordered ? (
    <ol key={key} className="ui-markdown__list" start={list.start !== 1 ? list.start : undefined}>
      {items}
    </ol>
  ) : (
    <ul key={key} className="ui-markdown__list">
      {items}
    </ul>
  );
}

function renderBlocks(blocks: MarkdownBlock[], options: BlockOptions): ReactNode[] {
  return blocks.map((block, index) => {
    switch (block.type) {
      case 'heading':
        return createElement(
          `h${Math.min(options.headingLevel + block.level - 1, 6)}`,
          { key: index, className: 'ui-markdown__heading', 'data-level': block.level },
          renderInline(block.children, options),
        );
      case 'paragraph':
        return (
          <p key={index} className="ui-markdown__paragraph">
            {renderInline(block.children, options)}
          </p>
        );
      case 'code':
        return (
          <CodeBlock
            key={index}
            className="ui-markdown__code-block"
            code={block.text}
            language={CODE_LANGUAGES[block.language] ?? 'text'}
            copyLabel={options.copyLabel}
            copiedLabel={options.copiedLabel}
            onCopyResult={options.onCopyResult}
          />
        );
      case 'quote':
        return (
          <blockquote key={index} className="ui-markdown__quote">
            {renderBlocks(block.children, options)}
          </blockquote>
        );
      case 'rule':
        return <hr key={index} className="ui-markdown__rule" />;
      case 'list':
        return renderList(block, index, options);
    }
  });
}

/**
 * Безопасный Markdown без зависимостей: заголовки, абзацы (переносы строк сохраняются),
 * **жирный**, *курсив*, `код`, блоки кода (`CodeBlock` с подсветкой python / cpp / javascript),
 * списки с вложенностью, цитаты, линия, ссылки. Без `dangerouslySetInnerHTML`: сырой HTML —
 * текстом, ссылки — только http(s) (остальные — просто текст), картинки — подписью.
 */
export const Markdown = forwardRef<HTMLDivElement, MarkdownProps>(function Markdown(
  {
    source,
    headingLevel = 2,
    onLinkClick,
    copyLabel,
    copiedLabel,
    onCopyResult,
    className,
    ...rest
  },
  ref,
) {
  const blocks = useMemo(() => parseMarkdown(source), [source]);
  return (
    <div ref={ref} className={cx('ui-markdown', className)} {...rest}>
      {renderBlocks(blocks, { headingLevel, onLinkClick, copyLabel, copiedLabel, onCopyResult })}
    </div>
  );
});
