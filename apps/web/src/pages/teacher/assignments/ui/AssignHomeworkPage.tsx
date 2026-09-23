import {
  type FileDto,
  type GenerationTarget,
  type GroupStudentRow,
  TOPIC_MAX_LENGTH,
  TOPIC_MIN_LENGTH,
} from '@edu/contracts';
import {
  Badge,
  Button,
  Card,
  Checkbox,
  Divider,
  Field,
  Inline,
  Input,
  Screen,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  useToast,
} from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import { useTeacherCourses } from '@/entities/course';
import { useCreateGenerationJob } from '@/entities/generation';
import { useTeacherGroup, useTeacherGroups } from '@/entities/group';
import { MaterialUploader } from '@/features/upload-file';
import { describeApiError } from '@/shared/api/errors';
import { AsyncState, ScreenHeader } from '@/shared/ui';

type Step = 'group' | 'what' | 'source';
type Source = 'topic' | 'materials';
/** Куда кладём результат: в существующий курс группы или в новый. */
const NEW_COURSE = '';

const studentName = (student: GroupStudentRow['student']) =>
  [student.user.firstName, student.user.lastName].filter(Boolean).join(' ');

/** Дата для `min` у поля срока: сегодня, раньше дедлайн ставить бессмысленно. */
const today = () => new Date().toISOString().slice(0, 10);

/**
 * `/teacher/assignments/new` — единственная точка, где преподаватель создаёт учебный материал
 * (docs/07 F7, F8): группа и адресаты → что задаём (одно ДЗ или целый курс) и в какой курс →
 * материалы или описание. Дальше работает пайплайн course-builder; для ученика результат всегда
 * выглядит курсом, который просто пополняется.
 */
export function AssignHomeworkPage() {
  const { t } = useTranslation('teacher');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const navigate = useNavigate();

  const [step, setStep] = useState<Step>('group');
  const [groupId, setGroupId] = useState('');
  const [wholeGroup, setWholeGroup] = useState(true);
  const [studentIds, setStudentIds] = useState<string[]>([]);
  const [target, setTarget] = useState<GenerationTarget>('HOMEWORK');
  const [courseId, setCourseId] = useState<string>(NEW_COURSE);
  const [dueAt, setDueAt] = useState('');
  const [source, setSource] = useState<Source>('topic');
  const [topic, setTopic] = useState('');
  const [files, setFiles] = useState<FileDto[]>([]);
  const [instructions, setInstructions] = useState('');
  const [title, setTitle] = useState('');

  const groups = useTeacherGroups();
  const group = useTeacherGroup(groupId);
  const courses = useTeacherCourses(groupId ? { groupId } : {});
  const create = useCreateGenerationJob();

  const topicTrimmed = topic.trim();
  const topicValid =
    topicTrimmed.length >= TOPIC_MIN_LENGTH && topicTrimmed.length <= TOPIC_MAX_LENGTH;
  // Дополнение к материалам необязательно, но короткий огрызок контракт не примет.
  const extraTopicInvalid =
    source === 'materials' && topicTrimmed.length > 0 && topicTrimmed.length < TOPIC_MIN_LENGTH;
  const minChars = t('courseBuilder.form.characters', { count: TOPIC_MIN_LENGTH });
  const canSubmit =
    !!groupId &&
    (wholeGroup || studentIds.length > 0) &&
    (source === 'topic' ? topicValid : files.length > 0 && !extraTopicInvalid);

  // Курсы, которые можно дополнить: архивные не предлагаем.
  const appendable = (courses.data?.items ?? []).filter((course) => course.status !== 'ARCHIVED');

  const onSubmit = () => {
    if (!canSubmit || create.isPending) return;
    create.mutate(
      {
        groupId,
        target,
        ...(courseId ? { targetCourseId: courseId } : {}),
        ...(wholeGroup ? {} : { studentIds }),
        ...(dueAt ? { dueAt: new Date(`${dueAt}T23:59:59`).toISOString() } : {}),
        ...(source === 'topic'
          ? { topic: topicTrimmed }
          : { materialIds: files.map((file) => file.id) }),
        ...(source === 'materials' && topicTrimmed ? { topic: topicTrimmed } : {}),
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        ...(title.trim() ? { targetTitle: title.trim() } : {}),
      },
      {
        onSuccess: (job) => {
          toast.show({ tone: 'success', title: t('assign.started') });
          navigate(`/teacher/course-builder/${job.id}`);
        },
        onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
      },
    );
  };

  const toggleStudent = (id: string, checked: boolean) =>
    setStudentIds((ids) => (checked ? [...new Set([...ids, id])] : ids.filter((x) => x !== id)));

  // ---------- шаги ----------

  const groupStep = (
    <Stack gap={4}>
      <Stack gap={1}>
        <Field
          label={t('assign.group')}
          required
          disabled={groups.isPending || groups.isError}
          hint={groups.isPending ? tc('states.loading') : undefined}
          error={groups.isError ? describeApiError(groups.error) : undefined}
        >
          <Select
            value={groupId}
            onChange={(event) => {
              setGroupId(event.target.value);
              // Состав и курсы у новой группы свои — прежний выбор к ней не относится.
              setStudentIds([]);
              setWholeGroup(true);
              setCourseId(NEW_COURSE);
            }}
            placeholder={t('assign.groupPlaceholder')}
            options={(groups.data?.items ?? []).map((item) => ({
              value: item.id,
              label: item.title,
            }))}
          />
        </Field>
        {groups.isError && (
          <Button variant="ghost" size="sm" onClick={() => void groups.refetch()}>
            {tc('actions.retry')}
          </Button>
        )}
      </Stack>

      {groupId && (
        <Stack gap={2}>
          <Text variant="title">{t('assign.whoTitle')}</Text>
          <SegmentedControl
            fullWidth
            aria-label={t('assign.whoTitle')}
            value={wholeGroup ? 'all' : 'some'}
            onChange={(value) => setWholeGroup(value === 'all')}
            options={[
              { value: 'all', label: t('assign.wholeGroup') },
              { value: 'some', label: t('assign.someStudents') },
            ]}
          />
          {!wholeGroup && (
            <AsyncState query={group}>
              {(detail) => (
                <Card>
                  <Stack gap={3}>
                    <Inline justify="between">
                      <Text tone="muted">{t('assign.selected', { count: studentIds.length })}</Text>
                      <Button
                        variant="link"
                        size="sm"
                        onClick={() =>
                          setStudentIds(
                            studentIds.length === detail.students.length
                              ? []
                              : detail.students.map((row) => row.student.id),
                          )
                        }
                      >
                        {studentIds.length === detail.students.length
                          ? t('assign.clearAll')
                          : t('assign.selectAll')}
                      </Button>
                    </Inline>
                    <Divider />
                    {detail.students.map((row) => (
                      <Checkbox
                        key={row.student.id}
                        label={studentName(row.student)}
                        checked={studentIds.includes(row.student.id)}
                        onChange={(event) => toggleStudent(row.student.id, event.target.checked)}
                      />
                    ))}
                  </Stack>
                </Card>
              )}
            </AsyncState>
          )}
        </Stack>
      )}
    </Stack>
  );

  const whatStep = (
    <Stack gap={4}>
      <Stack gap={2}>
        <Text variant="title">{t('assign.whatTitle')}</Text>
        <SegmentedControl
          fullWidth
          aria-label={t('assign.whatTitle')}
          value={target}
          onChange={(value) => setTarget(value as GenerationTarget)}
          options={[
            { value: 'HOMEWORK', label: t('assign.targetHomework') },
            { value: 'COURSE', label: t('assign.targetCourse') },
          ]}
        />
        <Text variant="caption" tone="muted">
          {target === 'HOMEWORK' ? t('assign.targetHomeworkHint') : t('assign.targetCourseHint')}
        </Text>
      </Stack>

      <Field label={t('assign.course')} hint={t('assign.courseHint')}>
        <Select
          value={courseId}
          onChange={(event) => setCourseId(event.target.value)}
          options={[
            { value: NEW_COURSE, label: t('assign.newCourse') },
            ...appendable.map((course) => ({
              value: course.id,
              label: `${course.title} · ${t(`assign.courseStatus.${course.status}`)}`,
            })),
          ]}
        />
      </Field>

      {target === 'HOMEWORK' && (
        <Field label={t('assign.dueAt')} hint={t('assign.dueAtHint')}>
          <Input
            type="date"
            min={today()}
            value={dueAt}
            onChange={(event) => setDueAt(event.target.value)}
          />
        </Field>
      )}

      <Field label={t('assign.name')} hint={t('assign.nameHint')}>
        <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
      </Field>
    </Stack>
  );

  const sourceStep = (
    <Stack gap={4}>
      <Stack gap={2}>
        <Text variant="title">{t('assign.sourceTitle')}</Text>
        <SegmentedControl
          fullWidth
          aria-label={t('assign.sourceTitle')}
          value={source}
          onChange={(value) => setSource(value as Source)}
          options={[
            { value: 'topic', label: t('assign.sourceTopic') },
            { value: 'materials', label: t('assign.sourceMaterials') },
          ]}
        />
        <Text variant="caption" tone="muted">
          {source === 'topic' ? t('assign.sourceTopicHint') : t('assign.sourceMaterialsHint')}
        </Text>
      </Stack>

      {source === 'materials' && (
        <Field label={t('courseBuilder.form.materials')} required>
          <MaterialUploader value={files} onChange={setFiles} disabled={create.isPending} />
        </Field>
      )}

      <Field
        label={source === 'topic' ? t('assign.topic') : t('courseBuilder.form.topicExtra')}
        required={source === 'topic'}
        hint={
          source === 'topic'
            ? t('assign.topicHint', { chars: minChars })
            : t('courseBuilder.form.topicExtraHint', { chars: minChars })
        }
        error={
          extraTopicInvalid
            ? t('courseBuilder.form.topicExtraTooShort', { chars: minChars })
            : undefined
        }
      >
        <Textarea
          value={topic}
          onChange={(event) => setTopic(event.target.value)}
          rows={5}
          maxLength={TOPIC_MAX_LENGTH}
          placeholder={t('assign.topicPlaceholder')}
        />
      </Field>

      <Field label={t('courseBuilder.form.instructions')}>
        <Textarea
          value={instructions}
          onChange={(event) => setInstructions(event.target.value)}
          rows={2}
          maxLength={2000}
          placeholder={t('courseBuilder.form.instructionsPlaceholder')}
        />
      </Field>
    </Stack>
  );

  const steps: Step[] = ['group', 'what', 'source'];
  const stepIndex = steps.indexOf(step);
  const canGoNext = step === 'group' ? !!groupId && (wholeGroup || studentIds.length > 0) : true;

  return (
    <>
      <ScreenHeader
        title={t('assign.title')}
        subtitle={t('assign.step', { current: stepIndex + 1, total: steps.length })}
        back={step === 'group' ? '/teacher/assignments' : true}
      />
      <Screen fill>
        <Inline gap={2}>
          {steps.map((item, index) => (
            <Badge key={item} tone={index <= stepIndex ? 'info' : 'neutral'}>
              {t(`assign.steps.${item}`)}
            </Badge>
          ))}
        </Inline>

        {step === 'group' && groupStep}
        {step === 'what' && whatStep}
        {step === 'source' && sourceStep}

        <Stack gap={2} justify="end" grow>
          {step === 'source' ? (
            <Button
              fullWidth
              size="lg"
              loading={create.isPending}
              disabled={!canSubmit}
              onClick={onSubmit}
            >
              {t('assign.submit')}
            </Button>
          ) : (
            <Button
              fullWidth
              size="lg"
              disabled={!canGoNext}
              onClick={() => setStep(steps[stepIndex + 1]!)}
            >
              {tc('actions.next')}
            </Button>
          )}
          {stepIndex > 0 && (
            <Button variant="ghost" fullWidth onClick={() => setStep(steps[stepIndex - 1]!)}>
              {tc('actions.back')}
            </Button>
          )}
        </Stack>
      </Screen>
    </>
  );
}
