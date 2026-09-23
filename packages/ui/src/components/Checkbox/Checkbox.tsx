import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { CheckIcon } from '../../icons';
import { useFieldControl } from '../Field/FieldContext';
import './Checkbox.css';

export interface CheckboxProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Подпись справа от чекбокса. */
  label?: ReactNode;
  /** Пояснение под подписью. */
  description?: ReactNode;
  /** Состояние ошибки (`aria-invalid`). */
  invalid?: boolean;
}

/**
 * Чекбокс с подписью. `className` уходит на корневой `<label>`,
 * остальные пропсы (checked, onChange, name…) — на `<input>`.
 */
export const Checkbox = forwardRef<HTMLInputElement, CheckboxProps>(function Checkbox(
  { label, description, invalid, className, id, required, disabled, ...rest },
  ref,
) {
  // Свой id, если его не дали ни пропсы, ни Field (в `Field group` у каждого контрола свой).
  const ownId = useId();
  const control = useFieldControl({
    id,
    required,
    disabled,
    'aria-invalid': invalid,
    'aria-describedby': rest['aria-describedby'],
  });
  return (
    <label className={cx('ui-checkbox', className)} data-disabled={control.disabled || undefined}>
      <input
        ref={ref}
        className="ui-checkbox__input"
        type="checkbox"
        {...rest}
        {...control}
        id={control.id ?? `ui-checkbox-${ownId}`}
      />
      <span className="ui-checkbox__box" aria-hidden="true">
        <CheckIcon className="ui-checkbox__mark" size={14} strokeWidth={3} />
      </span>
      {(label != null || description != null) && (
        <span className="ui-checkbox__text">
          {label != null && <span className="ui-checkbox__label">{label}</span>}
          {description != null && <span className="ui-checkbox__description">{description}</span>}
        </span>
      )}
    </label>
  );
});
