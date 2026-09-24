import { DialogBase, type DialogBaseProps } from '../../lib/DialogBase';
import './Drawer.css';

export type DrawerProps = DialogBaseProps;

/**
 * Боковая панель: выезжает справа на всю высоту, прижата к правому краю колонки контента,
 * учитывает safe-area. Поведение как у `Modal` (портал, `role="dialog"`, ловушка фокуса,
 * Escape, клик по фону, блокировка скролла). Для списков вроде центра уведомлений.
 */
export function Drawer(props: DrawerProps) {
  return <DialogBase prefix="ui-drawer" {...props} />;
}
