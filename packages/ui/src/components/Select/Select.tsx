import { forwardRef, type SelectHTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import { useFieldControl } from '../Field/FieldContext';
import './Select.css';

export interface SelectOption {
  value: string;
  label: string;
  disabled?: boolean;
}

export interface SelectProps extends Omit<SelectHTMLAttributes<HTMLSelectElement>, 'children'> {
  /** Список опций. */
  options: SelectOption[];
  /**
   * Плейсхолдер: недоступная опция с пустым значением в начале списка. Без `value`/`defaultValue`
   * (неконтролируемый режим) выбран изначально он, а не первая реальная опция.
   */
  placeholder?: string;
  /** Состояние ошибки (`aria-invalid`). Внутри `Field` с `error` ставится автоматически. */
  invalid?: boolean;
}

/** Нативный `<select>` — в WebView даёт системный пикер, что удобнее кастомного. */
export const Select = forwardRef<HTMLSelectElement, SelectProps>(function Select(
  { options, placeholder, invalid, className, id, required, disabled, ...rest },
  ref,
) {
  const control = useFieldControl({
    id,
    required,
    disabled,
    'aria-invalid': invalid,
    'aria-describedby': rest['aria-describedby'],
  });
  // Без явного значения браузер пропускает disabled-плейсхолдер и выбирает первую опцию.
  const placeholderDefault =
    placeholder != null && rest.value === undefined && rest.defaultValue === undefined
      ? ''
      : undefined;
  return (
    <select
      ref={ref}
      className={cx('ui-select', className)}
      defaultValue={placeholderDefault}
      {...rest}
      {...control}
    >
      {placeholder != null && (
        <option value="" disabled>
          {placeholder}
        </option>
      )}
      {options.map((option) => (
        <option key={option.value} value={option.value} disabled={option.disabled}>
          {option.label}
        </option>
      ))}
    </select>
  );
});
