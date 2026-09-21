import { Badge, Button, Card, EmptyState, Screen, Stack } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { StudentRow, useChildren } from '@/entities/student';
import { LinkChildForm } from '@/features/link-child';
import { useUiStore } from '@/shared/store/ui-store';
import { AsyncState, ScreenHeader, SectionTitle } from '@/shared/ui';

/** `/parent/children` — список детей + привязка по коду (F9). */
export function ChildrenPage() {
  const { t } = useTranslation('parent');
  const navigate = useNavigate();
  const query = useChildren();
  const selectedChildId = useUiStore((s) => s.selectedChildId);
  const setSelectedChildId = useUiStore((s) => s.setSelectedChildId);

  return (
    <>
      <ScreenHeader title={t('children.title')} bell />
      <Screen>
        <AsyncState
          query={query}
          isEmpty={(list) => list.items.length === 0}
          empty={<EmptyState title={t('children.empty')} description={t('children.emptyHint')} />}
        >
          {(list) => (
            <Card padding="none">
              {list.items.map((child) => {
                const selected = child.student.id === selectedChildId;
                return (
                  <StudentRow
                    key={child.student.id}
                    student={child.student}
                    subtitle={[child.school?.name, child.student.classLabel]
                      .filter(Boolean)
                      .join(' · ')}
                    right={
                      selected ? (
                        <Badge tone="success">{t('children.linkStatus.ACTIVE')}</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedChildId(child.student.id);
                            navigate('/parent');
                          }}
                        >
                          {t('children.select')}
                        </Button>
                      )
                    }
                  />
                );
              })}
            </Card>
          )}
        </AsyncState>

        <Stack gap={2}>
          <SectionTitle>{t('children.linkTitle')}</SectionTitle>
          <Card>
            <LinkChildForm
              onLinked={(studentId) => {
                setSelectedChildId(studentId);
                navigate('/parent');
              }}
            />
          </Card>
        </Stack>
      </Screen>
    </>
  );
}
