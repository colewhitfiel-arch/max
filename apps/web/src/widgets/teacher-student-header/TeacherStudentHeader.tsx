import type { StudentBrief } from '@edu/contracts';
import { Avatar, Inline, Skeleton, Text, VisuallyHidden } from '@edu/ui';
import type { ReactNode } from 'react';
import { shortName } from '@/entities/student';
import { fullName } from '@/shared/lib/format';
import { ScreenHeader } from '@/shared/ui';

export interface TeacherStudentHeaderProps {
  /** Ученик; пока карточка грузится — `undefined` (вместо имени скелет или `fallback`). */
  student?: StudentBrief;
  /**
   * Название экрана для скринридера перед именем в `h1` («Задания ученика: Смирнов А.») —
   * иначе экраны успеваемости и заданий одного ученика озвучиваются одинаково.
   */
  screenLabel: string;
  /** Заголовок без ученика (ошибка, чужой ученик). Не задан — скелет имени. */
  fallback?: ReactNode;
  /** Действие справа: «Успеваемость ✕» / «Задания ✕» (`Button variant="link"` + `CloseIcon`). */
  action: ReactNode;
}

/**
 * Шапка экранов ученика у преподавателя по макету: слева аватар и «Фамилия И.» (это `h1`,
 * перед именем — скрытое название экрана), справа действие закрытия. Плашка `solid` и липкая:
 * при прокрутке длинных заданий «✕» под рукой. Аватар декоративный — имя уже в заголовке.
 */
export function TeacherStudentHeader({
  student,
  screenLabel,
  fallback,
  action,
}: TeacherStudentHeaderProps) {
  const title = student ? (
    <Inline as="span" gap={2} wrap={false}>
      <Avatar name={fullName(student.user)} src={student.user.avatarUrl} aria-hidden />
      <VisuallyHidden>{screenLabel}: </VisuallyHidden>
      <Text as="span" variant="body" truncate>
        {shortName(student.user)}
      </Text>
    </Inline>
  ) : (
    (fallback ?? <Skeleton height={24} width="45%" />)
  );
  return <ScreenHeader variant="solid" sticky title={title} actions={action} />;
}
