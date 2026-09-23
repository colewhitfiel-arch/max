import { CLUB_CATEGORY_LABELS, type ClubDemand } from '@edu/contracts';
import { Card, EmptyState, Inline, Screen, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useClubDemand } from '@/entities/ai';
import { AsyncState, ScreenHeader } from '@/shared/ui';

/** Одна строка счётчика: подпись и число. */
function Counter({ label, value }: { label: string; value: number }) {
  return (
    <Text variant="caption" tone={value > 0 ? 'default' : 'muted'}>
      {label}:{' '}
      <Text as="span" weight="medium">
        {value}
      </Text>
    </Text>
  );
}

function DemandCard({ item }: { item: ClubDemand }) {
  const { t } = useTranslation('teacher');
  return (
    <Card>
      <Stack gap={2}>
        <Stack gap={0}>
          <Text weight="medium">{item.club.title}</Text>
          <Text variant="caption" tone="muted">
            {CLUB_CATEGORY_LABELS[item.club.category]}
          </Text>
        </Stack>
        <Inline gap={3} wrap>
          <Counter label={t('clubDemand.chosen')} value={item.chosen} />
          <Counter label={t('clubDemand.later')} value={item.later} />
          <Counter label={t('clubDemand.skipped')} value={item.skipped} />
          {item.avgScore !== null && (
            <Text variant="caption" tone="muted">
              {t('clubDemand.avgScore', { value: Math.round(item.avgScore * 100) })}
            </Text>
          )}
        </Inline>
        {item.reasons.length > 0 && (
          <Stack gap={0}>
            <Text variant="caption" tone="muted">
              {t('clubDemand.reasons')}
            </Text>
            {item.reasons.map((reason) => (
              <Text key={reason} variant="caption">
                — {reason}
              </Text>
            ))}
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

/**
 * `/teacher/clubs/demand` — что ученики выбирают в онбординге (записались / хотят позже / пропустили)
 * и какие направления называют «на будущее». Данные ИИ-онбординга, не посещаемость.
 */
export function ClubDemandPage() {
  const { t } = useTranslation('teacher');
  const query = useClubDemand();
  return (
    <>
      <ScreenHeader title={t('clubDemand.title')} back="/teacher/settings" />
      <Screen>
        <Text variant="small" tone="muted">
          {t('clubDemand.description')}
        </Text>
        <AsyncState
          query={query}
          isEmpty={(data) => data.students === 0}
          empty={<EmptyState title={t('clubDemand.empty')} />}
        >
          {(data) => (
            <Stack gap={3}>
              <Text variant="caption" tone="muted">
                {t('clubDemand.students', { count: data.students })}
              </Text>
              {data.items.map((item) => (
                <DemandCard key={item.club.id} item={item} />
              ))}
              {data.futureInterests.length > 0 && (
                <Card>
                  <Stack gap={1}>
                    <Text weight="medium">{t('clubDemand.futureTitle')}</Text>
                    <Text variant="caption" tone="muted">
                      {t('clubDemand.futureHint')}
                    </Text>
                    {data.futureInterests.map((entry) => (
                      <Text key={entry.label} variant="caption">
                        {entry.label} — {entry.count}
                      </Text>
                    ))}
                  </Stack>
                </Card>
              )}
            </Stack>
          )}
        </AsyncState>
      </Screen>
    </>
  );
}
