import type { AssignmentBrief, SubmissionStatus } from '@edu/contracts';
import { Badge, ListRow, type Tone } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { formatDue } from '@/shared/lib/dates';

const STATUS_TONE: Record<SubmissionStatus, Tone> = {
  NOT_STARTED: 'neutral',
  IN_PROGRESS: 'info',
  SUBMITTED: 'info',
  GRADED: 'success',
  RETURNED: 'warning',
};

export interface AssignmentCardProps {
  assignment: AssignmentBrief;
  onClick?: () => void;
  /** Слот справа вместо статуса сдачи (для преподавателя). */
  right?: React.ReactNode;
  /** Хвост подписи через «·» — например, кому адресовано задание (для преподавателя). */
  subtitleExtra?: string;
}

/** Задание в списке: название, кружок, срок, статус сдачи. Вкладывать в `Card padding="none"`. */
export function AssignmentCard({ assignment, onClick, right, subtitleExtra }: AssignmentCardProps) {
  const { t, i18n } = useTranslation('common');
  const due = assignment.dueAt
    ? `${t('assignment.due')}: ${formatDue(assignment.dueAt, i18n.language)}`
    : t('assignment.noDue');
  const subtitle = [assignment.group.club.title, due, subtitleExtra].filter(Boolean).join(' · ');
  const submission = assignment.submission;
  const status = submission?.status ?? 'NOT_STARTED';
  const badge = (
    <Badge tone={STATUS_TONE[status]}>
      {status === 'GRADED' && submission?.score != null
        ? `${submission.score} / ${assignment.maxScore}`
        : t(`assignment.status.${status}`)}
    </Badge>
  );
  return (
    <ListRow
      title={assignment.title}
      subtitle={subtitle}
      right={right ?? badge}
      onClick={onClick}
      chevron={onClick ? true : false}
    />
  );
}
