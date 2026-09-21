/**
 * @edu/ui — публичный API дизайн-системы.
 * Стили: токены и reset подключаются здесь один раз; CSS компонентов — самими компонентами.
 */
import './styles/index.css';

// Тема и токены
export { applyTheme, getTheme, resolveTheme, THEMES, type Theme } from './theme';
export { breakpoints, contentMaxWidth, durations, tokens, zIndex, type Breakpoint } from './tokens';
export type { Tone } from './types';

// Иконки
export * from './icons';

// Каркас
export * from './components/AppLayout';
export * from './components/Screen';
export * from './components/PageHeader';
export * from './components/BottomNavigation';
export * from './components/Modal';
export * from './components/Sheet';
export * from './components/Tabs';
export * from './components/SegmentedControl';

// Базовые
export * from './components/Button';
export * from './components/IconButton';
export * from './components/Input';
export * from './components/Textarea';
export * from './components/Select';
export * from './components/Field';
export * from './components/Checkbox';
export * from './components/Switch';
export * from './components/Chip';
export * from './components/Badge';
export * from './components/Avatar';
export * from './components/Skeleton';
export * from './components/Spinner';
export * from './components/EmptyState';
export * from './components/ErrorState';
export * from './components/Toast';

// Данные
export * from './components/Card';
export * from './components/ListRow';
export * from './components/StatTile';
export * from './components/ProgressBar';
export * from './components/ProgressRing';

// Раскладка и текст
export * from './components/Stack';
export * from './components/Inline';
export * from './components/Divider';
export * from './components/Text';
