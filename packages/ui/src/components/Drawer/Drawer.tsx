import { DialogBase, type DialogBaseProps } from '../../lib/DialogBase';
import './Drawer.css';

export interface DrawerProps extends DialogBaseProps {
  /** С какой стороны выезжает панель. По умолчанию `right`; `left` — история чатов. */
  side?: 'left' | 'right';
}

/**
 * Боковая панель: выезжает справа (или слева — `side="left"`) на всю высоту, прижата к краю
 * колонки контента, учитывает safe-area. Поведение как у `Modal` (портал, `role="dialog"`,
 * ловушка фокуса, Escape, клик по фону, блокировка скролла). Для списков вроде центра уведомлений.
 */
export function Drawer({ side = 'right', ...props }: DrawerProps) {
  return <DialogBase prefix="ui-drawer" data-side={side} {...props} />;
}
