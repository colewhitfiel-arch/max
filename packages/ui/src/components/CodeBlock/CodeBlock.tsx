import { forwardRef, useEffect, useMemo, useRef, useState, type HTMLAttributes } from 'react';
import { CopyIcon } from '../../icons';
import { cx } from '../../lib/cx';
import { VisuallyHidden } from '../VisuallyHidden';
import { tokenizeCode, type CodeLanguage } from './highlight';
import './CodeBlock.css';

export interface CodeBlockProps extends HTMLAttributes<HTMLDivElement> {
  /** Исходный код. Пробелы и переносы сохраняются как есть. */
  code: string;
  /** Язык подсветки. По умолчанию `text` (без подсветки). */
  language?: CodeLanguage;
  /** Подпись кнопки копирования. По умолчанию «копировать». */
  copyLabel?: string;
  /** Подпись после успешного копирования. По умолчанию «скопировано». */
  copiedLabel?: string;
  /** Результат копирования (например, тост при ошибке). */
  onCopyResult?: (ok: boolean) => void;
}

/** Сколько держится подпись «скопировано». */
const COPIED_MS = 2000;

/** Копирует текст: Clipboard API, а в WebView без него — через выделение во временном поле. */
async function copyText(text: string): Promise<boolean> {
  try {
    if (navigator.clipboard?.writeText) {
      await navigator.clipboard.writeText(text);
      return true;
    }
  } catch {
    // Нет разрешения/не secure context — пробуем старый способ ниже.
  }
  try {
    const field = document.createElement('textarea');
    field.value = text;
    field.setAttribute('readonly', '');
    field.style.position = 'fixed';
    field.style.opacity = '0';
    document.body.appendChild(field);
    try {
      field.select();
      return typeof document.execCommand === 'function' && document.execCommand('copy');
    } finally {
      field.remove();
    }
  } catch {
    return false;
  }
}

/**
 * Блок кода в стиле редактора (VS Code Dark+): моноширинный 12px, подсветка python / cpp /
 * javascript встроенным лексером без зависимостей, горизонтальная прокрутка длинных строк,
 * кнопка «копировать» в правом верхнем углу. Тёмный в обеих темах — как редактор.
 */
export const CodeBlock = forwardRef<HTMLDivElement, CodeBlockProps>(function CodeBlock(
  {
    code,
    language = 'text',
    copyLabel = 'копировать',
    copiedLabel = 'скопировано',
    onCopyResult,
    className,
    ...rest
  },
  ref,
) {
  const tokens = useMemo(() => tokenizeCode(code, language), [code, language]);
  const [copied, setCopied] = useState(false);
  const timer = useRef<ReturnType<typeof setTimeout> | undefined>(undefined);

  useEffect(() => () => clearTimeout(timer.current), []);

  const handleCopy = async () => {
    const ok = await copyText(code);
    onCopyResult?.(ok);
    if (!ok) return;
    setCopied(true);
    clearTimeout(timer.current);
    timer.current = setTimeout(() => setCopied(false), COPIED_MS);
  };

  return (
    <div ref={ref} className={cx('ui-code-block', className)} data-language={language} {...rest}>
      {/* Прокручиваемая область фокусируема — длинные строки листаются и с клавиатуры. */}
      <pre className="ui-code-block__pre" tabIndex={0}>
        <code className="ui-code-block__code">
          {tokens.map((token, index) =>
            token.type === 'plain' ? (
              token.text
            ) : (
              <span key={index} className="ui-code-block__token" data-token={token.type}>
                {token.text}
              </span>
            ),
          )}
        </code>
      </pre>
      <button
        type="button"
        className="ui-code-block__copy"
        data-copied={copied || undefined}
        onClick={() => void handleCopy()}
      >
        <CopyIcon size={12.5} />
        <span>{copied ? copiedLabel : copyLabel}</span>
      </button>
      <VisuallyHidden role="status">{copied ? copiedLabel : ''}</VisuallyHidden>
    </div>
  );
});
