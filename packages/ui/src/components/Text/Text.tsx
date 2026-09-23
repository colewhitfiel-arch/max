import { createElement, forwardRef, type ElementType, type HTMLAttributes } from 'react';
import { cx } from '../../lib/cx';
import './Text.css';

export type TextVariant = 'body' | 'small' | 'caption' | 'title' | 'heading';
export type TextTone = 'default' | 'muted' | 'primary' | 'success' | 'warning' | 'danger';
export type TextWeight = 'regular' | 'medium' | 'bold';

export interface TextProps extends HTMLAttributes<HTMLElement> {
  /** Стиль: heading 24px, title 20px, body 16px, small 14px, caption 12px. По умолчанию `body`. */
  variant?: TextVariant;
  /** Цвет. По умолчанию `default`. */
  tone?: TextTone;
  /** Насыщенность. По умолчанию зависит от варианта (heading/title — bold, остальные — regular). */
  weight?: TextWeight;
  /** Выравнивание. */
  align?: 'start' | 'center' | 'end';
  /** Обрезать одной строкой с многоточием. */
  truncate?: boolean;
  /** Сохранять переносы строк и пробелы из текста (`white-space: pre-wrap`) — многострочный пользовательский ввод. */
  preserveLines?: boolean;
  /** HTML-тег. По умолчанию: heading → h1, title → h2, body/small → p, caption → span. */
  as?: ElementType;
}

const DEFAULT_TAG: Record<TextVariant, ElementType> = {
  heading: 'h1',
  title: 'h2',
  body: 'p',
  small: 'p',
  caption: 'span',
};

/** Текст с типографическими вариантами из токенов. */
export const Text = forwardRef<HTMLElement, TextProps>(function Text(
  {
    variant = 'body',
    tone = 'default',
    weight,
    align,
    truncate = false,
    preserveLines = false,
    as,
    className,
    ...rest
  },
  ref,
) {
  return createElement(as ?? DEFAULT_TAG[variant], {
    ref,
    className: cx('ui-text', className),
    'data-variant': variant,
    'data-tone': tone,
    'data-weight': weight,
    'data-align': align,
    'data-truncate': truncate || undefined,
    'data-preserve-lines': preserveLines || undefined,
    ...rest,
  });
});
