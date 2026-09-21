import {
  forwardRef,
  useCallback,
  useImperativeHandle,
  useLayoutEffect,
  useRef,
  type ChangeEvent,
  type FormEvent,
  type FormHTMLAttributes,
  type KeyboardEvent,
} from 'react';
import { cx } from '../../lib/cx';
import { SendIcon, StopIcon } from '../../icons';
import { Spinner } from '../Spinner';
import './ChatComposer.css';

export interface ChatComposerProps extends Omit<
  FormHTMLAttributes<HTMLFormElement>,
  'onSubmit' | 'onChange'
> {
  /** Текст поля (controlled). */
  value: string;
  onChange: (value: string) => void;
  /** Отправка: Enter (без Shift) или кнопка. Пустой/пробельный текст не отправляется. */
  onSubmit: (value: string) => void;
  placeholder?: string;
  /** Поле недоступно. */
  disabled?: boolean;
  /**
   * Ответ генерируется: поле остаётся доступным для набора, кнопка отправки
   * превращается в «Стоп» (при `onStop`) или в спиннер.
   */
  busy?: boolean;
  /** Прервать генерацию. */
  onStop?: () => void;
  /** Максимум строк, до которого поле растёт. По умолчанию 5. */
  maxRows?: number;
  /** Доступные названия кнопок. */
  sendLabel?: string;
  stopLabel?: string;
  /** Прижать к низу скролл-области с подложкой под цвет фона. */
  sticky?: boolean;
  /** Автофокус на поле при монтировании. */
  autoFocus?: boolean;
}

export interface ChatComposerHandle {
  focus: () => void;
}

/**
 * Поле ввода сообщения: «пилюля» с авторастущим textarea и круглой кнопкой отправки
 * в стиле акцентного пункта нижнего меню.
 */
export const ChatComposer = forwardRef<ChatComposerHandle, ChatComposerProps>(function ChatComposer(
  {
    value,
    onChange,
    onSubmit,
    placeholder,
    disabled = false,
    busy = false,
    onStop,
    maxRows = 5,
    sendLabel = 'Отправить',
    stopLabel = 'Остановить',
    sticky = false,
    autoFocus = false,
    className,
    ...rest
  },
  ref,
) {
  const textareaRef = useRef<HTMLTextAreaElement>(null);
  useImperativeHandle(ref, () => ({ focus: () => textareaRef.current?.focus() }), []);

  // Авторост: сбрасываем высоту и берём scrollHeight, ограничивая maxRows.
  useLayoutEffect(() => {
    const el = textareaRef.current;
    if (!el) return;
    el.style.height = 'auto';
    const lineHeight = parseFloat(getComputedStyle(el).lineHeight) || 22;
    const max = lineHeight * maxRows;
    el.style.height = `${Math.min(el.scrollHeight, max)}px`;
    el.style.overflowY = el.scrollHeight > max ? 'auto' : 'hidden';
  }, [value, maxRows]);

  const canSend = value.trim().length > 0 && !disabled && !busy;

  const submit = useCallback(() => {
    const text = value.trim();
    if (!text || disabled || busy) return;
    onSubmit(text);
  }, [value, disabled, busy, onSubmit]);

  const handleSubmit = (event: FormEvent<HTMLFormElement>) => {
    event.preventDefault();
    submit();
  };

  const handleKeyDown = (event: KeyboardEvent<HTMLTextAreaElement>) => {
    if (event.key === 'Enter' && !event.shiftKey && !event.nativeEvent.isComposing) {
      event.preventDefault();
      submit();
    }
  };

  const handleChange = (event: ChangeEvent<HTMLTextAreaElement>) => onChange(event.target.value);

  return (
    <form
      className={cx('ui-chat-composer', className)}
      data-sticky={sticky || undefined}
      data-busy={busy || undefined}
      onSubmit={handleSubmit}
      {...rest}
    >
      <div className="ui-chat-composer__field" data-disabled={disabled || undefined}>
        <textarea
          ref={textareaRef}
          className="ui-chat-composer__input"
          rows={1}
          value={value}
          placeholder={placeholder}
          disabled={disabled}
          autoFocus={autoFocus}
          onChange={handleChange}
          onKeyDown={handleKeyDown}
          aria-label={placeholder}
        />
      </div>
      {busy && onStop ? (
        <button
          type="button"
          className="ui-chat-composer__action"
          data-action="stop"
          aria-label={stopLabel}
          onClick={onStop}
        >
          <StopIcon />
        </button>
      ) : (
        <button
          type="submit"
          className="ui-chat-composer__action"
          data-action="send"
          aria-label={sendLabel}
          disabled={!canSend}
          aria-busy={busy || undefined}
        >
          {busy ? <Spinner size="sm" aria-hidden="true" /> : <SendIcon />}
        </button>
      )}
    </form>
  );
});
