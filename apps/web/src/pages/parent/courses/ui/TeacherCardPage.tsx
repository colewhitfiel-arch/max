import { Avatar, Button, Card, Chip, Inline, Screen, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useParams } from 'react-router';
import { useTeacherCard } from '@/entities/club';
import { fullName } from '@/shared/lib/format';
import { useMaxBridge } from '@/shared/max';
import { AsyncState, ScreenHeader, SectionTitle } from '@/shared/ui';

/** `/parent/courses/teacher/:teacherId` — `GET /teachers/:id` (контакты по политике школы). */
export function TeacherCardPage() {
  const { teacherId = '' } = useParams();
  const { t } = useTranslation('parent');
  const bridge = useMaxBridge();
  const query = useTeacherCard(teacherId);

  return (
    <>
      <ScreenHeader title={t('courses.teacher')} back="/parent/courses" />
      <Screen>
        <AsyncState query={query}>
          {(teacher) => (
            <>
              <Card>
                <Inline gap={3} wrap={false}>
                  <Avatar
                    name={fullName(teacher.user)}
                    src={teacher.photoUrl ?? teacher.user.avatarUrl}
                    size="lg"
                  />
                  <Stack gap={1}>
                    <Text weight="medium">{fullName(teacher.user)}</Text>
                    {teacher.qualification && (
                      <Text variant="caption" tone="muted">
                        {teacher.qualification}
                      </Text>
                    )}
                  </Stack>
                </Inline>
              </Card>

              {teacher.bio && (
                <Stack gap={2}>
                  <SectionTitle>{t('courses.bio')}</SectionTitle>
                  <Card>
                    <Text>{teacher.bio}</Text>
                  </Card>
                </Stack>
              )}

              {teacher.clubs.length > 0 && (
                <Stack gap={2}>
                  <SectionTitle>{t('courses.teacherClubs')}</SectionTitle>
                  <Inline>
                    {teacher.clubs.map((club) => (
                      <Chip key={club.id} disabled>
                        {club.title}
                      </Chip>
                    ))}
                  </Inline>
                </Stack>
              )}

              <Stack gap={2}>
                <SectionTitle>{t('courses.contacts')}</SectionTitle>
                <Card>
                  {teacher.contacts ? (
                    <Stack gap={1}>
                      {teacher.contacts.phone && (
                        <Button
                          variant="ghost"
                          size="sm"
                          onClick={() => bridge.openLink(`tel:${teacher.contacts!.phone}`)}
                        >
                          {teacher.contacts.phone}
                        </Button>
                      )}
                      {teacher.contacts.email && <Text>{teacher.contacts.email}</Text>}
                    </Stack>
                  ) : (
                    <Text tone="muted">{t('courses.contactsHidden')}</Text>
                  )}
                </Card>
              </Stack>
            </>
          )}
        </AsyncState>
      </Screen>
    </>
  );
}
