import { Badge, Button, Card, EmptyState, Screen, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useLocation, useNavigate } from 'react-router';
import { StudentRow, useChildren } from '@/entities/student';
import { ChildInviteLink, LinkChildForm } from '@/features/link-child';
import { isFromApp } from '@/shared/lib/navigation';
import { PARENT_HOME_PATH } from '@/shared/lib/parent-paths';
import { useUiStore } from '@/shared/store/ui-store';
import { AsyncState, ScreenHeader, SectionTitle } from '@/shared/ui';

/**
 * `/parent/children` — список детей + добавление: ссылка-приглашение в MAX (F14) или код
 * из профиля ребёнка (F9). В нижнем меню раздела нет — сюда ведут с экранов родителя.
 */
export function ChildrenPage() {
  const { t } = useTranslation('parent');
  const navigate = useNavigate();
  const location = useLocation();
  const query = useChildren();
  const selectedChildId = useUiStore((s) => s.selectedChildId);
  const setSelectedChildId = useUiStore((s) => s.setSelectedChildId);

  return (
    <>
      <ScreenHeader
        title={t('children.title')}
        back={isFromApp(location.state) ? true : PARENT_HOME_PATH}
        bell
      />
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
                      // Не подтверждённая связь — её статус (выбрать нельзя: данные ребёнка
                      // сервер отдаёт только по ACTIVE); выбранный — «Выбран», прочие — «Выбрать».
                      child.linkStatus !== 'ACTIVE' ? (
                        <Badge tone={child.linkStatus === 'PENDING' ? 'warning' : 'neutral'}>
                          {t(`children.linkStatus.${child.linkStatus}`)}
                        </Badge>
                      ) : selected ? (
                        <Badge tone="success">{t('children.selected')}</Badge>
                      ) : (
                        <Button
                          size="sm"
                          variant="secondary"
                          onClick={(event) => {
                            event.stopPropagation();
                            setSelectedChildId(child.student.id);
                            navigate(PARENT_HOME_PATH);
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

        {/* Оба способа привязки — одним блоком (подсветка демонстрационного режима). */}
        <Stack gap={4} data-tour="link-child">
          <Stack gap={2}>
            <SectionTitle>{t('addChild.invite.title')}</SectionTitle>
            <Card>
              <Stack gap={3}>
                <Text variant="small" tone="muted">
                  {t('addChild.invite.description')}
                </Text>
                <ChildInviteLink />
              </Stack>
            </Card>
          </Stack>

          <Stack gap={2}>
            <SectionTitle>{t('children.linkTitle')}</SectionTitle>
            <Card>
              <LinkChildForm
                onLinked={(studentId) => {
                  setSelectedChildId(studentId);
                  navigate(PARENT_HOME_PATH);
                }}
              />
            </Card>
          </Stack>
        </Stack>
      </Screen>
    </>
  );
}
