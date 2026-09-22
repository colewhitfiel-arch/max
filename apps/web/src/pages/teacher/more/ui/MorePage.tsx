import { Card, ListRow, Screen } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { ScreenHeader } from '@/shared/ui';
import { AccountSection } from '@/widgets/account-section';

/** `/teacher/more` — профиль/настройки преподавателя + ссылка на конструктор курса. */
export function MorePage() {
  const { t } = useTranslation('teacher');
  const navigate = useNavigate();
  return (
    <>
      <ScreenHeader title={t('more.title')} bell />
      <Screen>
        <Card padding="none">
          <ListRow
            title={t('courseBuilder.title')}
            onClick={() => navigate('/teacher/course-builder')}
          />
          <ListRow
            title={t('clubDemand.title')}
            subtitle={t('clubDemand.short')}
            onClick={() => navigate('/teacher/clubs/demand')}
          />
        </Card>
        <AccountSection />
      </Screen>
    </>
  );
}
