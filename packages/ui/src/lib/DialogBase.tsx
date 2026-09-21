import {
  useId,
  useRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
  type RefObject,
} from 'react';
import { createPortal } from 'react-dom';
import { CloseIcon } from '../icons';
import { IconButton } from '../components/IconButton';
import { cx } from './cx';
import { useFocusTrap } from './useFocusTrap';
import { useScrollLock } from './useScrollLock';

/** Общие пропсы Modal и Sheet. */
export interface DialogBaseProps extends Omit<HTMLAttributes<HTMLDivElement>, 'title'> {
  /** Открыт ли диалог. При `false` ничего не рендерится. */
  open: boolean;
  /** Запрос на закрытие: Escape, клик по фону, кнопка «Закрыть». */
  onClose: () => void;
  /** Заголовок; связывается с диалогом через `aria-labelledby`. */
  title?: ReactNode;
  /** Нижняя панель (обычно кнопки). */
  footer?: ReactNode;
  /** Содержимое. */
  children?: ReactNode;
  /** Закрывать по клику на фон. По умолчанию `true`. */
  closeOnBackdrop?: boolean;
  /** Закрывать по Escape. По умолчанию `true`. */
  closeOnEscape?: boolean;
  /** Показывать кнопку «Закрыть» в шапке. По умолчанию `true`. */
  showClose?: boolean;
  /** Элемент, который получит фокус при открытии. По умолчанию — первый фокусируемый. */
  initialFocusRef?: RefObject<HTMLElement | null>;
}

interface DialogBaseInternalProps extends DialogBaseProps {
  /** Префикс CSS-классов: `ui-modal` или `ui-sheet`. */
  prefix: string;
  /** Рисовать «ручку» сверху (для bottom sheet). */
  handle?: boolean;
}

/**
 * Внутренняя база для Modal и Sheet: портал в body, `role="dialog"`, `aria-modal`,
 * ловушка фокуса, Escape, клик по фону, блокировка скролла body.
 */
export function DialogBase({
  prefix,
  handle = false,
  open,
  onClose,
  title,
  footer,
  children,
  closeOnBackdrop = true,
  closeOnEscape = true,
  showClose = true,
  initialFocusRef,
  className,
  onKeyDown,
  ...rest
}: DialogBaseInternalProps) {
  const dialogRef = useRef<HTMLDivElement>(null);
  const titleId = useId();

  useScrollLock(open);
  useFocusTrap(dialogRef, open, initialFocusRef);

  if (!open) return null;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    onKeyDown?.(event);
    if (closeOnEscape && event.key === 'Escape' && !event.defaultPrevented) {
      event.stopPropagation();
      onClose();
    }
  };

  const hasHeader = title != null || showClose;

  return createPortal(
    <div className={prefix} data-state="open">
      <div
        className={`${prefix}__backdrop`}
        aria-hidden="true"
        onClick={closeOnBackdrop ? onClose : undefined}
      />
      <div
        ref={dialogRef}
        className={cx(`${prefix}__dialog`, className)}
        role="dialog"
        aria-modal="true"
        aria-labelledby={title != null ? titleId : undefined}
        tabIndex={-1}
        onKeyDown={handleKeyDown}
        {...rest}
      >
        {handle && <div className={`${prefix}__handle`} aria-hidden="true" />}
        {hasHeader && (
          <div className={`${prefix}__header`}>
            {title != null && (
              <h2 className={`${prefix}__title`} id={titleId}>
                {title}
              </h2>
            )}
            {showClose && (
              <IconButton
                className={`${prefix}__close`}
                aria-label="Закрыть"
                size="sm"
                onClick={onClose}
              >
                <CloseIcon />
              </IconButton>
            )}
          </div>
        )}
        <div className={`${prefix}__body`}>{children}</div>
        {footer != null && <div className={`${prefix}__footer`}>{footer}</div>}
      </div>
    </div>,
    document.body,
  );
}
