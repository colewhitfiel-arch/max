import { forwardRef, useId, useMemo, type HTMLAttributes, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { FieldContext, type FieldContextValue } from './FieldContext';
import './Field.css';

export interface FieldProps extends HTMLAttributes<HTMLDivElement> {
  /** Подпись поля; рендерится как `<label for=...>`. */
  label?: ReactNode;
  /** Подсказка под контролом. */
  hint?: ReactNode;
  /** Текст ошибки. Если задан — контрол получает `aria-invalid` и `aria-describedby`. */
  error?: ReactNode;
  /** Обязательное поле: звёздочка в подписи и `required` у контрола. */
  required?: boolean;
  /** Недоступное поле: приглушает подпись и передаёт `disabled` контролу. */
  disabled?: boolean;
  /** id контрола. Если не задан — генерируется. */
  htmlFor?: string;
  /** Контрол (Input, Select, …). Связывание — через контекст `useFieldControl`. */
  children: ReactNode;
}

/** Обёртка поля формы: label + контрол + hint + error, с корректной a11y-связью. */
export const Field = forwardRef<HTMLDivElement, FieldProps>(function Field(
  { label, hint, error, required = false, disabled = false, htmlFor, className, children, ...rest },
  ref,
) {
  const generatedId = useId();
  const id = htmlFor ?? `ui-field-${generatedId}`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const hasError = error != null && error !== false && error !== '';
  const hasHint = hint != null && hint !== false && hint !== '';

  const context = useMemo<FieldContextValue>(
    () => ({
      id,
      describedBy:
        [hasError ? errorId : null, hasHint ? hintId : null].filter(Boolean).join(' ') || undefined,
      invalid: hasError,
      required,
      disabled,
    }),
    [id, hasError, errorId, hasHint, hintId, required, disabled],
  );

  return (
    <div
      ref={ref}
      className={cx('ui-field', className)}
      data-invalid={hasError || undefined}
      data-disabled={disabled || undefined}
      {...rest}
    >
      {label != null && (
        <label className="ui-field__label" htmlFor={id}>
          {label}
          {required && (
            <span className="ui-field__required" aria-hidden="true">
              *
            </span>
          )}
        </label>
      )}
      <FieldContext.Provider value={context}>
        <div className="ui-field__control">{children}</div>
      </FieldContext.Provider>
      {hasError && (
        <p className="ui-field__error" id={errorId} role="alert">
          {error}
        </p>
      )}
      {hasHint && (
        <p className="ui-field__hint" id={hintId}>
          {hint}
        </p>
      )}
    </div>
  );
});
