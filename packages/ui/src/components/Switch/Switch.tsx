import { forwardRef, useId, type InputHTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { useFieldControl } from '../Field/FieldContext';
import './Switch.css';

export interface SwitchProps extends Omit<InputHTMLAttributes<HTMLInputElement>, 'type'> {
  /** Подпись слева от переключателя. */
  label?: ReactNode;
  /** Пояснение под подписью. */
  description?: ReactNode;
}

/**
 * Переключатель (`role="switch"`) с подписью. `className` уходит на корневой `<label>`,
 * остальные пропсы (checked, onChange, name…) — на `<input>`.
 */
export const Switch = forwardRef<HTMLInputElement, SwitchProps>(function Switch(
  { label, description, className, id, required, disabled, ...rest },
  ref,
) {
  // Свой id, если его не дали ни пропсы, ни Field (в `Field group` у каждого контрола свой).
  const ownId = useId();
  const control = useFieldControl({
    id,
    required,
    disabled,
    'aria-describedby': rest['aria-describedby'],
  });
  return (
    <label className={cx('ui-switch', className)} data-disabled={control.disabled || undefined}>
      {(label != null || description != null) && (
        <span className="ui-switch__text">
          {label != null && <span className="ui-switch__label">{label}</span>}
          {description != null && <span className="ui-switch__description">{description}</span>}
        </span>
      )}
      <input
        ref={ref}
        className="ui-switch__input"
        type="checkbox"
        role="switch"
        {...rest}
        {...control}
        id={control.id ?? `ui-switch-${ownId}`}
      />
      <span className="ui-switch__track" aria-hidden="true">
        <span className="ui-switch__thumb" />
      </span>
    </label>
  );
});
