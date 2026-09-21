import type { HomeworkClub } from '@edu/contracts';
import { CardColumns, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';

/**
 * «Рекомендации на сегодня»: карточки-колонки «Название | Количество заданий»
 * по кружкам с открытыми заданиями (порядок — по ближайшему дедлайну, как отдаёт API).
 */
export function HomeworkRecommendations({ clubs }: { clubs: HomeworkClub[] }) {
  const { t } = useTranslation('student');
  const rows = clubs.filter((item) => item.openCount > 0);
  if (rows.length === 0) {
    return (
      <Text variant="small" tone="muted">
        {t('homework.noOpen')}
      </Text>
    );
  }
  return (
    <CardColumns
      aria-label={t('homework.recommendations')}
      columns={[
        { key: 'club', header: t('homework.columns.club'), fit: true },
        { key: 'count', header: t('homework.columns.count'), align: 'center', nowrap: true },
      ]}
      rows={rows.map((item) => ({
        key: item.group.id,
        cells: { club: item.club.title, count: item.openCount },
      }))}
    />
  );
}
