import {
  createContext,
  forwardRef,
  useContext,
  useLayoutEffect,
  useMemo,
  useState,
  type CSSProperties,
  type HTMLAttributes,
  type ReactNode,
} from 'react';
import { cx } from '../../lib/cx';
import './AppLayout.css';

export interface AppLayoutProps extends HTMLAttributes<HTMLDivElement> {
  /** Шапка (обычно `PageHeader`); прижата к верху, учитывает safe-area. */
  header?: ReactNode;
  /** Нижнее меню (обычно `BottomNavigation`); прижато к низу, учитывает safe-area. */
  bottomNav?: ReactNode;
  /** Содержимое — как правило `AppLayout.Content`. */
  children?: ReactNode;
}

export type AppLayoutContentProps = HTMLAttributes<HTMLElement>;

/** Полноэкранный фон-картинка под шапкой, контентом и меню (экран «Задания» — звёзды). */
export interface AppLayoutBackdropProps {
  /** URL картинки. */
  image: string;
  /** Непрозрачность слоя 0..1. По умолчанию 1. */
  opacity?: number;
  /** CSS `background-size`. По умолчанию `cover`. */
  size?: string;
  /** CSS `background-position`. По умолчанию `center`. */
  position?: string;
  /** CSS `background-repeat`. По умолчанию `no-repeat`. */
  repeat?: string;
}

type BackdropState = AppLayoutBackdropProps | null;

const BackdropContext = createContext<((backdrop: BackdropState) => void) | null>(null);

/**
 * Объявляет фон экрана: рендерится страницей внутри `AppLayout`, ничего не рисует сам —
 * слой появляется в каркасе на всю высоту окна и снимается при размонтировании.
 */
function AppLayoutBackdrop({ image, opacity, size, position, repeat }: AppLayoutBackdropProps) {
  const setBackdrop = useContext(BackdropContext);
  useLayoutEffect(() => {
    if (!setBackdrop) return;
    setBackdrop({ image, opacity, size, position, repeat });
    return () => setBackdrop(null);
  }, [setBackdrop, image, opacity, size, position, repeat]);
  return null;
}

/** Скроллируемая область между шапкой и меню (`<main>`). */
const AppLayoutContent = forwardRef<HTMLElement, AppLayoutContentProps>(function AppLayoutContent(
  { className, ...rest },
  ref,
) {
  return <main ref={ref} className={cx('ui-app-layout__content', className)} {...rest} />;
});

const AppLayoutRoot = forwardRef<HTMLDivElement, AppLayoutProps>(function AppLayout(
  { header, bottomNav, className, children, ...rest },
  ref,
) {
  const [backdrop, setBackdrop] = useState<BackdropState>(null);
  const backdropStyle = useMemo<CSSProperties | undefined>(
    () =>
      backdrop
        ? {
            backgroundImage: `url(${backdrop.image})`,
            backgroundSize: backdrop.size ?? 'cover',
            backgroundPosition: backdrop.position ?? 'center',
            backgroundRepeat: backdrop.repeat ?? 'no-repeat',
            opacity: backdrop.opacity ?? 1,
          }
        : undefined,
    [backdrop],
  );
  return (
    <BackdropContext.Provider value={setBackdrop}>
      <div ref={ref} className={cx('ui-app-layout', className)} {...rest}>
        {backdropStyle && (
          <div className="ui-app-layout__backdrop" style={backdropStyle} aria-hidden="true" />
        )}
        {header != null && <div className="ui-app-layout__header">{header}</div>}
        {children}
        {bottomNav != null && <div className="ui-app-layout__nav">{bottomNav}</div>}
      </div>
    </BackdropContext.Provider>
  );
});

/**
 * Каркас приложения: шапка / скролл-контент / нижнее меню на всю высоту окна,
 * контент ограничен 640px по центру на широких экранах. `AppLayout.Backdrop` — фон экрана.
 */
export const AppLayout = Object.assign(AppLayoutRoot, {
  Content: AppLayoutContent,
  Backdrop: AppLayoutBackdrop,
});
