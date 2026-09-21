import {
  forwardRef,
  useId,
  useRef,
  type HTMLAttributes,
  type KeyboardEvent,
  type ReactNode,
} from 'react';
import { cx } from '../../lib/cx';
import { getRovingIndex } from '../../lib/roving';
import { useControllable } from '../../lib/useControllable';
import './Tabs.css';

export interface TabItem {
  /** Уникальный ключ вкладки. */
  key: string;
  /** Подпись. */
  label: ReactNode;
  /** Иконка слева от подписи. */
  icon?: ReactNode;
  /** Недоступная вкладка. */
  disabled?: boolean;
}

export interface TabsProps extends Omit<HTMLAttributes<HTMLDivElement>, 'onChange' | 'children'> {
  /** Вкладки. */
  items: TabItem[];
  /** Активная вкладка (controlled). */
  value?: string;
  /** Начальная вкладка (uncontrolled). По умолчанию — первая доступная. */
  defaultValue?: string;
  /** Смена вкладки. */
  onChange?: (key: string) => void;
  /**
   * Содержимое панели активной вкладки. Если не задано — панель не рендерится,
   * потребитель показывает контент сам (например, разные экраны).
   */
  children?: ReactNode | ((activeKey: string) => ReactNode);
  /** Растянуть вкладки на всю ширину. */
  fitted?: boolean;
}

/**
 * Вкладки: `role="tablist"/"tab"/"tabpanel"`, roving tabindex, стрелки/Home/End,
 * активация по фокусу (automatic activation).
 */
export const Tabs = forwardRef<HTMLDivElement, TabsProps>(function Tabs(
  { items, value, defaultValue, onChange, children, fitted = false, className, ...rest },
  ref,
) {
  const baseId = useId();
  const firstEnabled = items.find((item) => !item.disabled)?.key ?? items[0]?.key ?? '';
  const [activeKey, setActiveKey] = useControllable(value, defaultValue ?? firstEnabled, onChange);
  const tabRefs = useRef(new Map<string, HTMLButtonElement>());

  const activeIndex = Math.max(
    0,
    items.findIndex((item) => item.key === activeKey),
  );
  const tabId = (index: number) => `${baseId}-tab-${index}`;
  const panelId = `${baseId}-panel`;

  const handleKeyDown = (event: KeyboardEvent<HTMLDivElement>) => {
    const next = getRovingIndex(event.key, activeIndex, items.length, (index) =>
      Boolean(items[index]?.disabled),
    );
    if (next == null) return;
    const item = items[next];
    if (!item) return;
    event.preventDefault();
    setActiveKey(item.key);
    tabRefs.current.get(item.key)?.focus();
  };

  const panel = typeof children === 'function' ? children(activeKey) : children;

  return (
    <div ref={ref} className={cx('ui-tabs', className)} data-fitted={fitted || undefined} {...rest}>
      <div className="ui-tabs__list" role="tablist" onKeyDown={handleKeyDown}>
        {items.map((item, index) => {
          const selected = item.key === activeKey;
          return (
            <button
              key={item.key}
              ref={(node) => {
                if (node) tabRefs.current.set(item.key, node);
                else tabRefs.current.delete(item.key);
              }}
              type="button"
              role="tab"
              id={tabId(index)}
              className="ui-tabs__tab"
              aria-selected={selected}
              aria-controls={panel != null ? panelId : undefined}
              tabIndex={selected ? 0 : -1}
              disabled={item.disabled}
              data-state={selected ? 'active' : 'inactive'}
              onClick={() => setActiveKey(item.key)}
            >
              {item.icon != null && <span className="ui-tabs__icon">{item.icon}</span>}
              <span className="ui-tabs__label">{item.label}</span>
            </button>
          );
        })}
      </div>
      {panel != null && (
        <div
          className="ui-tabs__panel"
          role="tabpanel"
          id={panelId}
          aria-labelledby={tabId(activeIndex)}
          tabIndex={0}
        >
          {panel}
        </div>
      )}
    </div>
  );
});
