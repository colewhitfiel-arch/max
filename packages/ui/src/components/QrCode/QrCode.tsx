import { forwardRef, type HTMLAttributes, useMemo } from 'react';
import { encode } from 'uqr';
import { cx } from '../../lib/cx';
import './QrCode.css';

export type QrCodeEcc = 'L' | 'M' | 'Q' | 'H';

export interface QrCodeProps extends Omit<HTMLAttributes<HTMLDivElement>, 'children'> {
  /** Что зашить в код: ссылка или текст. */
  value: string;
  /** Доступное название картинки (скринридер не прочитает сам код). */
  label: string;
  /** Предельная сторона, px: код тянется на ширину контейнера, но не больше. По умолчанию 280. */
  size?: number;
  /** Уровень коррекции ошибок. По умолчанию `M` — код с экрана телефона читается и с бликом. */
  ecc?: QrCodeEcc;
}

/** Поле тишины вокруг кода в модулях (ISO/IEC 18004 требует 4). */
const QUIET_ZONE = 4;

/** Тёмные модули одним контуром: подряд идущие в строке — одним прямоугольником. */
function modulesPath(data: boolean[][]): string {
  let d = '';
  data.forEach((row, y) => {
    let x = 0;
    while (x < row.length) {
      if (!row[x]) {
        x += 1;
        continue;
      }
      const start = x;
      while (x < row.length && row[x]) x += 1;
      d += `M${start} ${y}h${x - start}v1h${start - x}z`;
    }
  });
  return d;
}

/**
 * QR-код как inline-SVG (генерация — `uqr`, без canvas и сети). Всегда чёрный на белом с
 * полем тишины: так его читают все сканеры, в том числе встроенный сканер MAX, и в тёмной теме.
 */
export const QrCode = forwardRef<HTMLDivElement, QrCodeProps>(function QrCode(
  { value, label, size = 280, ecc = 'M', className, style, ...rest },
  ref,
) {
  const { path, modules } = useMemo(() => {
    const qr = encode(value, { ecc, border: QUIET_ZONE });
    return { path: modulesPath(qr.data), modules: qr.size };
  }, [value, ecc]);

  return (
    <div
      ref={ref}
      className={cx('ui-qr-code', className)}
      style={{ maxWidth: size, ...style }}
      {...rest}
    >
      <svg
        viewBox={`0 0 ${modules} ${modules}`}
        role="img"
        aria-label={label}
        shapeRendering="crispEdges"
      >
        <path d={path} />
      </svg>
    </div>
  );
});
