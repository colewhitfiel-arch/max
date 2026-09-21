import { forwardRef, type TextareaHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import { useFieldControl } from '../Field/FieldContext';
import './Textarea.css';

export interface TextareaProps extends TextareaHTMLAttributes<HTMLTextAreaElement> {
  /** Состояние ошибки (`aria-invalid`). Внутри `Field` с `error` ставится автоматически. */
  invalid?: boolean;
}

/** Многострочное поле. По умолчанию 3 строки, изменение размера только по вертикали. */
export const Textarea = forwardRef<HTMLTextAreaElement, TextareaProps>(function Textarea(
  { invalid, className, id, required, disabled, rows = 3, ...rest },
  ref,
) {
  const control = useFieldControl({
    id,
    required,
    disabled,
    'aria-invalid': invalid,
    'aria-describedby': rest['aria-describedby'],
  });
  return (
    <textarea
      ref={ref}
      className={cx('ui-textarea', className)}
      rows={rows}
      {...rest}
      {...control}
    />
  );
});
