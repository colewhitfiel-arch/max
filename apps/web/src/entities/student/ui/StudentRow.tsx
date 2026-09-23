import type { StudentBrief } from '@edu/contracts';
import { Avatar, ListRow } from '@edu/ui';
import type { ReactNode } from 'react';
import { useTranslation } from 'react-i18next';
import { fullName } from '@/shared/lib/format';

export interface StudentRowProps {
  student: StudentBrief;
  subtitle?: ReactNode;
  right?: ReactNode;
  onClick?: () => void;
}

/** Строка ученика: аватар, имя, класс. Вкладывать в `Card padding="none"`. */
export function StudentRow({ student, subtitle, right, onClick }: StudentRowProps) {
  const { t } = useTranslation('common');
  const name = fullName(student.user);
  return (
    <ListRow
      left={<Avatar name={name} src={student.user.avatarUrl} />}
      title={name || t('user.noName')}
      subtitle={subtitle ?? student.classLabel ?? undefined}
      right={right}
      onClick={onClick}
    />
  );
}
