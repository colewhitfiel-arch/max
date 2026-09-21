import { AppLayout, Button, Card, PageHeader, Screen, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useCompleteOnboarding } from '@/entities/ai';
import { roleHomePath } from '@/shared/auth/role-routes';

/**
 * Заглушка «Онбординг с ИИ». «Пропустить (dev)» пытается закрыть онбординг на сервере
 * (в mock-режиме работает, в real — 404) и в любом случае ведёт на главную.
 */
export function OnboardingPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const complete = useCompleteOnboarding();

  const skip = () => {
    complete.mutate(
      {
        selectedClubIds: [],
        profileDraft: {
          interests: [],
          goals: [],
          weeklyHours: 0,
          preferredFormats: [],
          summary: '',
        },
      },
      { onSettled: () => navigate(roleHomePath('STUDENT'), { replace: true }) },
    );
  };

  return (
    <AppLayout header={<PageHeader title={t('onboarding.title')} />}>
      <AppLayout.Content>
        <Screen>
          <Card>
            <Stack gap={3}>
              <Text>{t('onboarding.description')}</Text>
              <Button variant="secondary" fullWidth loading={complete.isPending} onClick={skip}>
                {t('onboarding.skip')}
              </Button>
            </Stack>
          </Card>
        </Screen>
      </AppLayout.Content>
    </AppLayout>
  );
}
