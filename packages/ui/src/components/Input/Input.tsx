import { forwardRef, type InputHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import { useFieldControl } from '../Field/FieldContext';
import './Input.css';

export interface InputProps extends InputHTMLAttributes<HTMLInputElement> {
  /** Состояние ошибки (`aria-invalid`). Внутри `Field` с `error` ставится автоматически. */
  invalid?: boolean;
}

/** Текстовое поле. Внутри `Field` автоматически связывается с label/hint/error. */
export const Input = forwardRef<HTMLInputElement, InputProps>(function Input(
  { invalid, className, id, required, disabled, ...rest },
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
    <input ref={ref} className={cx('ui-input', className)} type="text" {...rest} {...control} />
  );
});
