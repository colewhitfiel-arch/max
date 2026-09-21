import { DialogBase, type DialogBaseProps } from '../../lib/DialogBase';
import './Modal.css';

export type ModalProps = DialogBaseProps;

/**
 * Модальное окно по центру экрана. Портал в body, `role="dialog"`, `aria-modal`,
 * ловушка фокуса, Escape, клик по фону, блокировка скролла body.
 * Для мобильных действий предпочитай `Sheet`.
 */
export function Modal(props: ModalProps) {
  return <DialogBase prefix="ui-modal" {...props} />;
}
