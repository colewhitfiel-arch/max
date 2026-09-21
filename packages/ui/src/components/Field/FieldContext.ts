import { createContext, useContext } from 'react';

export interface FieldContextValue {
  /** id контрола, на который указывает label. */
  id: string;
  /** Список id для aria-describedby (hint/error). */
  describedBy?: string;
  /** Есть ли ошибка. */
  invalid: boolean;
  /** Обязательное поле. */
  required: boolean;
  /** Поле недоступно. */
  disabled: boolean;
}

export const FieldContext = createContext<FieldContextValue | null>(null);

export interface FieldControlAttributes {
  id?: string;
  'aria-describedby'?: string;
  'aria-invalid'?: boolean;
  required?: boolean;
  disabled?: boolean;
}

/**
 * Атрибуты для контрола внутри `Field`: id, aria-describedby, aria-invalid, required, disabled.
 * Явно переданные пропсы контрола имеют приоритет над контекстом.
 * Используй для кастомных контролов; Input/Textarea/Select/Checkbox/Switch делают это сами.
 */
export function useFieldControl(own: FieldControlAttributes = {}): FieldControlAttributes {
  const field = useContext(FieldContext);
  if (!field) return own;
  return {
    id: own.id ?? field.id,
    'aria-describedby': own['aria-describedby'] ?? field.describedBy,
    'aria-invalid': own['aria-invalid'] ?? (field.invalid || undefined),
    required: own.required ?? (field.required || undefined),
    disabled: own.disabled ?? (field.disabled || undefined),
  };
}
