import { forwardRef, type HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import './ChatBubble.css';

export interface TypingIndicatorProps extends HTMLAttributes<HTMLSpanElement> {
  /** Доступное название. По умолчанию «Печатает…». */
  label?: string;
}

/** Три пульсирующие точки — собеседник набирает ответ (`role="status"`). */
export const TypingIndicator = forwardRef<HTMLSpanElement, TypingIndicatorProps>(
  function TypingIndicator({ label = 'Печатает…', className, ...rest }, ref) {
    return (
      <span
        ref={ref}
        className={cx('ui-typing', className)}
        role="status"
        aria-label={label}
        {...rest}
      >
        <span className="ui-typing__dot" />
        <span className="ui-typing__dot" />
        <span className="ui-typing__dot" />
      </span>
    );
  },
);
