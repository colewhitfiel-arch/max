import { DialogBase, type DialogBaseProps } from '../../lib/DialogBase';
import './Sheet.css';

export type SheetProps = DialogBaseProps;

/**
 * Bottom sheet: выезжает снизу, прижат к нижнему краю, учитывает safe-area.
 * Поведение как у `Modal` (портал, `role="dialog"`, ловушка фокуса, Escape, фон, блокировка скролла).
 */
export function Sheet(props: SheetProps) {
  return <DialogBase prefix="ui-sheet" handle {...props} />;
}
