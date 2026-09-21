import {
  createContext,
  useCallback,
  useContext,
  useEffect,
  useMemo,
  useRef,
  useState,
  type ReactNode,
} from 'react';
import { createPortal } from 'react-dom';
import type { Tone } from '../../types';
import { Toast, type ToastAction } from './Toast';

export interface ToastOptions {
  /** Заголовок (основной текст). */
  title?: ReactNode;
  /** Пояснение. */
  description?: ReactNode;
  /** Окраска. По умолчанию `neutral`. */
  tone?: Tone;
  /** Время показа в мс; `0` — пока не закроют. По умолчанию — `defaultDuration` провайдера. */
  duration?: number;
  /** Действие («Отменить»). */
  action?: ToastAction;
}

export interface ToastItem extends ToastOptions {
  id: string;
}

export interface ToastApi {
  /** Показать тост; строка — короткая форма `{ title }`. Возвращает id. */
  show: (toast: ToastOptions | string) => string;
  /** Скрыть тост по id. */
  dismiss: (id: string) => void;
  /** Скрыть все. */
  clear: () => void;
}

const ToastContext = createContext<ToastApi | null>(null);

export interface ToastProviderProps {
  children?: ReactNode;
  /** Максимум одновременно видимых тостов; старые вытесняются. По умолчанию 3. */
  max?: number;
  /** Время показа по умолчанию, мс. По умолчанию 4000. */
  defaultDuration?: number;
}

/** Провайдер очереди тостов. Регион `aria-live="polite"` рендерится порталом в body. */
export function ToastProvider({ children, max = 3, defaultDuration = 4000 }: ToastProviderProps) {
  const [items, setItems] = useState<ToastItem[]>([]);
  const timers = useRef(new Map<string, ReturnType<typeof setTimeout>>());
  const counter = useRef(0);

  const clearTimer = useCallback((id: string) => {
    const timer = timers.current.get(id);
    if (timer !== undefined) {
      clearTimeout(timer);
      timers.current.delete(id);
    }
  }, []);

  const dismiss = useCallback(
    (id: string) => {
      clearTimer(id);
      setItems((prev) => prev.filter((item) => item.id !== id));
    },
    [clearTimer],
  );

  const show = useCallback(
    (input: ToastOptions | string) => {
      const options: ToastOptions = typeof input === 'string' ? { title: input } : input;
      counter.current += 1;
      const id = `ui-toast-${counter.current}`;
      setItems((prev) => {
        const next = [...prev, { ...options, id }];
        const dropped = next.slice(0, Math.max(0, next.length - max));
        dropped.forEach((item) => clearTimer(item.id));
        return next.slice(-max);
      });
      const duration = options.duration ?? defaultDuration;
      if (duration > 0) {
        timers.current.set(
          id,
          setTimeout(() => dismiss(id), duration),
        );
      }
      return id;
    },
    [clearTimer, defaultDuration, dismiss, max],
  );

  const clear = useCallback(() => {
    timers.current.forEach((timer) => clearTimeout(timer));
    timers.current.clear();
    setItems([]);
  }, []);

  useEffect(() => {
    const map = timers.current;
    return () => {
      map.forEach((timer) => clearTimeout(timer));
      map.clear();
    };
  }, []);

  const api = useMemo<ToastApi>(() => ({ show, dismiss, clear }), [show, dismiss, clear]);

  return (
    <ToastContext.Provider value={api}>
      {children}
      {createPortal(
        <div className="ui-toast-region" role="region" aria-live="polite" aria-label="Уведомления">
          {items.map((item) => (
            <Toast
              key={item.id}
              tone={item.tone}
              title={item.title}
              description={item.description}
              action={item.action}
              onDismiss={() => dismiss(item.id)}
            />
          ))}
        </div>,
        document.body,
      )}
    </ToastContext.Provider>
  );
}

/** Доступ к очереди тостов. Бросает ошибку вне `ToastProvider`. */
export function useToast(): ToastApi {
  const context = useContext(ToastContext);
  if (!context) throw new Error('useToast: оберни приложение в <ToastProvider>');
  return context;
}
