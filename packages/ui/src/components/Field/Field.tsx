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
  /** id контрола. Если не задан — генерируется. В групповом режиме — основа id подписи/hint/error. */
  htmlFor?: string;
  /**
   * Группа контролов под одной подписью (чекбоксы, переключатели): корень — `role="group"`
   * с именем из подписи, hint/error — его описание (`aria-describedby`). id подписи в
   * контролы не пробрасывается — у каждого свой, имя даёт его собственная подпись; `required`
   * — только звёздочка у подписи группы (у отдельного чекбокса он значил бы «отметь именно
   * этот»), `disabled` передаётся всем контролам.
   */
  group?: boolean;
  /** Контрол (Input, Select, …). Связывание — через контекст `useFieldControl`. */
  children: ReactNode;
}

/** Обёртка поля формы: label + контрол + hint + error, с корректной a11y-связью. */
export const Field = forwardRef<HTMLDivElement, FieldProps>(function Field(
  {
    label,
    hint,
    error,
    required = false,
    disabled = false,
    htmlFor,
    group = false,
    className,
    children,
    ...rest
  },
  ref,
) {
  const generatedId = useId();
  const id = htmlFor ?? `ui-field-${generatedId}`;
  const labelId = `${id}-label`;
  const hintId = `${id}-hint`;
  const errorId = `${id}-error`;
  const hasError = error != null && error !== false && error !== '';
  const hasHint = hint != null && hint !== false && hint !== '';
  const describedBy =
    [hasError ? errorId : null, hasHint ? hintId : null].filter(Boolean).join(' ') || undefined;

  const context = useMemo<FieldContextValue>(
    () =>
      group
        ? { invalid: false, required: false, disabled }
        : { id, describedBy, invalid: hasError, required, disabled },
    [group, id, describedBy, hasError, required, disabled],
  );

  const requiredMark = required && (
    <span className="ui-field__required" aria-hidden="true">
      *
    </span>
  );

  return (
    <div
      ref={ref}
      className={cx('ui-field', className)}
      data-invalid={hasError || undefined}
      data-disabled={disabled || undefined}
      role={group ? 'group' : undefined}
      aria-labelledby={group && label != null ? labelId : undefined}
      aria-describedby={group ? describedBy : undefined}
      {...rest}
    >
      {label != null &&
        (group ? (
          <div className="ui-field__label" id={labelId}>
            {label}
            {requiredMark}
          </div>
        ) : (
          <label className="ui-field__label" htmlFor={id}>
            {label}
            {requiredMark}
          </label>
        ))}
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
