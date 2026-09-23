import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { useFieldControl } from '../Field/FieldContext';
import './Radio.css';

export interface RadioProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Подпись справа от переключателя. */
  label?: ReactNode;
  /** Пояснение под подписью. */
  description?: ReactNode;
  /** Состояние ошибки (`aria-invalid`). */
  invalid?: boolean;
}

/**
 * Переключатель одного варианта из нескольких. Группу собирает `Field group` с общим `name`
 * у всех Radio — иначе браузер не свяжет их между собой и стрелки не будут переключать.
 * `className` уходит на корневой `<label>`, остальные пропсы — на `<input>`.
 */
export const Radio = forwardRef<HTMLInputElement, RadioProps>(function Radio(
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
    <label className={cx('ui-radio', className)} data-disabled={control.disabled || undefined}>
      <input
        ref={ref}
        className="ui-radio__input"
        type="radio"
        {...rest}
        {...control}
        id={control.id ?? `ui-radio-${ownId}`}
      />
      <span className="ui-radio__box" aria-hidden="true">
        <span className="ui-radio__dot" />
      </span>
      {(label != null || description != null) && (
        <span className="ui-radio__text">
          {label != null && <span className="ui-radio__label">{label}</span>}
          {description != null && <span className="ui-radio__description">{description}</span>}
        </span>
      )}
    </label>
  );
});
