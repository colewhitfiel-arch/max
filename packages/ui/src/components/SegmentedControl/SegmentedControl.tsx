import { forwardRef, useRef, type HTMLAttributes, type KeyboardEvent, type ReactNode } from 'react';
import { cx } from '../../lib/cx';
import { getRovingIndex } from '../../lib/roving';
import { useControllable } from '../../lib/useControllable';
import './SegmentedControl.css';

export interface SegmentedOption {
  value: string;
  label: ReactNode;
  disabled?: boolean;
}

export interface SegmentedControlProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange'> {
  /** Варианты. */
  options: SegmentedOption[];
  /** Выбранное значение (controlled). */
  value?: string;
  /** Начальное значение (uncontrolled). По умолчанию — первый доступный вариант. */
  defaultValue?: string;
  /** Смена значения. */
  onChange?: (value: string) => void;
  /** Размер: sm 32px, md 40px. По умолчанию `md`. */
  size?: 'sm' | 'md';
  /**
   * Вид: `default` — сегменты на поверхности; `accent` — «таблетка» цвета
   * `--ui-color-accent-2` с белым выбранным сегментом и объёмной тенью справа
   * (переключатель периода на главной родителя; размер задан макетом, `size` не влияет).
   */
  variant?: 'default' | 'accent';
  /** Растянуть на всю ширину. */
  fullWidth?: boolean;
  /** Отключить все сегменты. */
  disabled?: boolean;
}

/** Сегментированный переключатель: `role="radiogroup"`, стрелки, roving tabindex. */
export const SegmentedControl = forwardRef<HTMLDivElement, SegmentedControlProps>(
  function SegmentedControl(
    {
      options,
      value,
      defaultValue,
      onChange,
      size = 'md',
      variant = 'default',
      fullWidth = false,
      disabled = false,
      className,
      ...rest
    },
    ref,
  ) {
    const firstEnabled = options.find((o) => !o.disabled)?.value ?? options[0]?.value ?? '';
    const [current, setCurrent] = useControllable(value, defaultValue ?? firstEnabled, onChange);
    const refs = useRef(new Map<string, HTMLButtonElement>());
    const matchedIndex = options.findIndex((o) => o.value === current);
    // Roving tabindex: если value не совпал ни с одной опцией, в tab-order — первая доступная,
    // иначе группа недостижима с клавиатуры.
    const currentIndex =
      matchedIndex >= 0
        ? matchedIndex
        : Math.max(
            0,
            options.findIndex((o) => !o.disabled),
          );

    const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
      if (disabled) return;
      const next = getRovingIndex(event.key, currentIndex, options.length, (index) =>
        Boolean(options[index]?.disabled),
      );
      if (next == null) return;
      const option = options[next];
      if (!option) return;
      event.preventDefault();
      setCurrent(option.value);
      refs.current.get(option.value)?.focus();
    };

    return (
      <div
        ref={ref}
        className={cx('ui-segmented', className)}
        role="radiogroup"
        data-size={size}
        data-variant={variant}
        data-full-width={fullWidth || undefined}
        data-disabled={disabled || undefined}
        onKeyDown={handleKeyDown}
        {...rest}
      >
        {options.map((option, index) => {
          const checked = option.value === current;
          return (
            <button
              key={option.value}
              ref={(node) => {
                if (node) refs.current.set(option.value, node);
                else refs.current.delete(option.value);
              }}
              type="button"
              role="radio"
              className="ui-segmented__item"
              aria-checked={checked}
              tabIndex={index === currentIndex ? 0 : -1}
              disabled={disabled || option.disabled}
              data-state={checked ? 'checked' : 'unchecked'}
              onClick={() => setCurrent(option.value)}
            >
              {option.label}
            </button>
          );
        })}
      </div>
    );
  },
);
