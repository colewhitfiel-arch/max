import type { ChildBrief } from '@edu/contracts';
import { Select } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { fullName } from '@/shared/lib/format';

export interface ChildSwitcherProps {
  children: ChildBrief[];
  value: string | null;
  onChange: (studentId: string) => void;
}

/** Выбор ребёнка в шапке родителя (нативный select — удобен в WebView). */
export function ChildSwitcher({ children, value, onChange }: ChildSwitcherProps) {
  const { t } = useTranslation('parent');
  if (children.length === 0) return null;
  return (
    <Select
      aria-label={t('childSwitcher.label')}
      value={value ?? ''}
      onChange={(event) => onChange(event.target.value)}
      options={children.map((child) => ({
        value: child.student.id,
        label: fullName(child.student.user),
      }))}
    />
  );
}
