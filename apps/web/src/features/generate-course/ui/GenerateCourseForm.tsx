import { type FileDto, TOPIC_MAX_LENGTH, TOPIC_MIN_LENGTH } from '@edu/contracts';
import {
  Button,
  Field,
  Input,
  SegmentedControl,
  Select,
  Stack,
  Text,
  Textarea,
  useToast,
} from '@edu/ui';
import { useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useCreateGenerationJob } from '@/entities/generation';
import { useTeacherGroups } from '@/entities/group';
import { MaterialUploader } from '@/features/upload-file';
import { describeApiError } from '@/shared/api/errors';

export interface GenerateCourseFormProps {
  onCreated: (jobId: string) => void;
}

type Mode = 'topic' | 'materials';

/**
 * Запуск генерации курса (F8) в двух режимах: по теме/практике без конспекта — ИИ сам пишет
 * конспект-атомы; из загруженных материалов — текст извлекается из файлов.
 */
export function GenerateCourseForm({ onCreated }: GenerateCourseFormProps) {
  const { t } = useTranslation('teacher');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const groups = useTeacherGroups();
  const create = useCreateGenerationJob();
  const [mode, setMode] = useState<Mode>('topic');
  const [groupId, setGroupId] = useState('');
  const [topic, setTopic] = useState('');
  const [files, setFiles] = useState<FileDto[]>([]);
  const [instructions, setInstructions] = useState('');
  const [title, setTitle] = useState('');

  const topicTrimmed = topic.trim();
  const topicValid =
    topicTrimmed.length >= TOPIC_MIN_LENGTH && topicTrimmed.length <= TOPIC_MAX_LENGTH;
  // Дополнение к материалам необязательно, но если заполнено — контракт требует минимум символов.
  const extraTopicInvalid =
    mode === 'materials' && topicTrimmed.length > 0 && topicTrimmed.length < TOPIC_MIN_LENGTH;
  // «10 символов» склоняется по числу (count), а не вшито в фразу подсказки.
  const minChars = t('courseBuilder.form.characters', { count: TOPIC_MIN_LENGTH });
  const canSubmit =
    !!groupId && (mode === 'topic' ? topicValid : files.length > 0 && !extraTopicInvalid);

  const onSubmit = (event: FormEvent) => {
    event.preventDefault();
    if (!canSubmit || create.isPending) return;
    create.mutate(
      {
        groupId,
        ...(mode === 'topic' ? { topic: topicTrimmed } : { materialIds: files.map((f) => f.id) }),
        ...(mode === 'materials' && topicTrimmed ? { topic: topicTrimmed } : {}),
        ...(instructions.trim() ? { instructions: instructions.trim() } : {}),
        ...(title.trim() ? { targetTitle: title.trim() } : {}),
      },
      {
        onSuccess: (job) => {
          toast.show({ tone: 'success', title: t('courseBuilder.form.started') });
          onCreated(job.id);
        },
        onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
      },
    );
  };

  return (
    <form onSubmit={onSubmit}>
      <Stack gap={3}>
        <SegmentedControl
          fullWidth
          aria-label={t('courseBuilder.form.modeLabel')}
          value={mode}
          onChange={(value) => setMode(value as Mode)}
          options={[
            { value: 'topic', label: t('courseBuilder.form.modeTopic') },
            { value: 'materials', label: t('courseBuilder.form.modeMaterials') },
          ]}
        />
        <Text variant="caption" tone="muted">
          {mode === 'topic'
            ? t('courseBuilder.form.modeTopicHint')
            : t('courseBuilder.form.modeMaterialsHint')}
        </Text>

        <Stack gap={1}>
          <Field
            label={t('courseBuilder.form.group')}
            required
            disabled={groups.isPending || groups.isError}
            hint={groups.isPending ? tc('states.loading') : undefined}
            error={groups.isError ? describeApiError(groups.error) : undefined}
          >
            <Select
              value={groupId}
              onChange={(event) => setGroupId(event.target.value)}
              placeholder={t('courseBuilder.form.groupPlaceholder')}
              options={(groups.data?.items ?? []).map((group) => ({
                value: group.id,
                label: group.title,
              }))}
            />
          </Field>
          {groups.isError && (
            <Button variant="ghost" size="sm" onClick={() => void groups.refetch()}>
              {tc('actions.retry')}
            </Button>
          )}
        </Stack>

        {mode === 'materials' && (
          <Field label={t('courseBuilder.form.materials')} required>
            <MaterialUploader value={files} onChange={setFiles} disabled={create.isPending} />
          </Field>
        )}

        <Field
          label={
            mode === 'topic' ? t('courseBuilder.form.topic') : t('courseBuilder.form.topicExtra')
          }
          required={mode === 'topic'}
          hint={
            mode === 'topic'
              ? t('courseBuilder.form.topicHint', { chars: minChars })
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
            rows={4}
            maxLength={TOPIC_MAX_LENGTH}
            placeholder={t('courseBuilder.form.topicPlaceholder')}
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

        <Field label={t('courseBuilder.form.title')}>
          <Input value={title} onChange={(event) => setTitle(event.target.value)} maxLength={200} />
        </Field>

        <Button type="submit" fullWidth loading={create.isPending} disabled={!canSubmit}>
          {t('courseBuilder.form.submit')}
        </Button>
      </Stack>
    </form>
  );
}
