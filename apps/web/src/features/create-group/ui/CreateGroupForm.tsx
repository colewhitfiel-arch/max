import {
  CLUB_CATEGORIES,
  type ClubCategory,
  type CreatedGroup,
  type NewScheduleRule,
} from '@edu/contracts';
import {
  Button,
  Card,
  Field,
  Grid,
  Input,
  PlusIcon,
  Select,
  Stack,
  Text,
  Textarea,
  TrashIcon,
  useToast,
} from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { ClubPickList } from '@/entities/club';
import { useCreateGroup } from '@/entities/group';
import { describeApiError } from '@/shared/api/errors';
import { weekdayLongName } from '@/shared/lib/dates';
import { SectionTitle } from '@/shared/ui';

/** Дни недели в порядке показа: пн … вс (0 — воскресенье, как в `ScheduleRule.weekday`). */
const WEEK_ORDER = [1, 2, 3, 4, 5, 6, 0] as const;

/** Самая большая цена за месяц, которую можно ввести, ₽. */
const MAX_PRICE_RUB = 1_000_000;

interface ScheduleRow extends NewScheduleRule {
  key: number;
}

export interface CreateGroupFormProps {
  /** Кружки, которые ведёт преподаватель: в списке — первыми, первый выбран сразу. */
  subjects: readonly ClubCategory[];
  onCreated: (created: CreatedGroup) => void;
}

/** Цена в копейках из «1 500» / «1500»; null — не целое число рублей в пределах лимита. */
function parsePrice(value: string): number | null {
  const normalized = value.replace(/\s/g, '');
  if (normalized === '') return 0;
  if (!/^\d+$/.test(normalized)) return null;
  const rub = Number(normalized);
  return rub <= MAX_PRICE_RUB ? rub * 100 : null;
}

/**
 * «Новая группа» (docs/07 F19): кружок (свои — первыми), название, цена за месяц, описание и дни
 * занятий → `POST /teacher/groups`. Группа сразу появляется в каталоге школы и получает ссылку.
 */
export function CreateGroupForm({ subjects, onCreated }: CreateGroupFormProps) {
  const { t, i18n } = useTranslation('teacher');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const create = useCreateGroup();
  const ordered = [...subjects, ...CLUB_CATEGORIES.filter((c) => !subjects.includes(c))];
  const [category, setCategory] = useState<ClubCategory>(ordered[0]!);
  const [title, setTitle] = useState('');
  const [price, setPrice] = useState('');
  const [description, setDescription] = useState('');
  const [schedule, setSchedule] = useState<ScheduleRow[]>([]);
  const [nextKey, setNextKey] = useState(1);
  const [submitted, setSubmitted] = useState(false);

  const clubLabel = tc(`clubCategory.${category}`);
  const priceKopecks = parsePrice(price);
  const badTime = (row: ScheduleRow) => row.endTime <= row.startTime;
  const invalid = priceKopecks === null || schedule.some(badTime);

  const weekdayOptions = WEEK_ORDER.map((day) => ({
    value: String(day),
    label: weekdayLongName(day, i18n.language),
  }));

  const updateRow = (key: number, patch: Partial<NewScheduleRule>) =>
    setSchedule((rows) => rows.map((row) => (row.key === key ? { ...row, ...patch } : row)));

  const addRow = () => {
    const last = schedule.at(-1);
    setSchedule((rows) => [
      ...rows,
      {
        key: nextKey,
        // Следующий день — через один от предыдущего (пн → ср), первый — понедельник.
        weekday: last ? (last.weekday + 2) % 7 : 1,
        startTime: last?.startTime ?? '16:00',
        endTime: last?.endTime ?? '17:00',
      },
    ]);
    setNextKey((key) => key + 1);
  };

  const onSubmit = async () => {
    setSubmitted(true);
    if (invalid || priceKopecks === null) return;
    try {
      const created = await create.mutateAsync({
        category,
        title: title.trim() || clubLabel,
        description: description.trim() || undefined,
        price: { amountKopecks: priceKopecks, currency: 'RUB' },
        schedule: schedule.map(({ weekday, startTime, endTime }) => ({
          weekday,
          startTime,
          endTime,
        })),
      });
      toast.show({ tone: 'success', title: t('newGroup.created') });
      onCreated(created);
    } catch (cause) {
      toast.show({
        tone: 'danger',
        title: t('newGroup.error'),
        description: describeApiError(cause),
      });
    }
  };

  return (
    <Stack gap={5}>
      <Stack gap={2}>
        <SectionTitle>{t('newGroup.club')}</SectionTitle>
        {subjects.length > 0 && (
          <Text variant="caption" tone="muted">
            {t('newGroup.clubHint')}
          </Text>
        )}
        <ClubPickList
          categories={ordered}
          selected={[category]}
          onToggle={setCategory}
          aria-label={t('newGroup.club')}
        />
      </Stack>

      <Field label={t('newGroup.name')}>
        <Input
          value={title}
          maxLength={80}
          placeholder={t('newGroup.namePlaceholder', { club: clubLabel })}
          onChange={(event) => setTitle(event.target.value)}
        />
      </Field>

      <Field
        label={t('newGroup.price')}
        hint={t('newGroup.priceHint')}
        error={submitted && priceKopecks === null ? t('newGroup.invalidPrice') : undefined}
      >
        <Input
          value={price}
          inputMode="numeric"
          placeholder="0"
          onChange={(event) => setPrice(event.target.value)}
        />
      </Field>

      <Field label={t('newGroup.description')} hint={t('newGroup.descriptionHint')}>
        <Textarea
          value={description}
          maxLength={500}
          rows={3}
          onChange={(event) => setDescription(event.target.value)}
        />
      </Field>

      <Stack gap={2}>
        <SectionTitle>{t('newGroup.schedule')}</SectionTitle>
        <Text variant="caption" tone="muted">
          {t('newGroup.scheduleHint')}
        </Text>
        {schedule.map((row) => (
          <Card key={row.key}>
            <Stack gap={2}>
              <Field label={t('newGroup.weekday')}>
                <Select
                  options={weekdayOptions}
                  value={String(row.weekday)}
                  onChange={(event) => updateRow(row.key, { weekday: Number(event.target.value) })}
                />
              </Field>
              <Grid columns={2} gap={2}>
                <Field label={t('newGroup.from')}>
                  <Input
                    type="time"
                    value={row.startTime}
                    onChange={(event) => updateRow(row.key, { startTime: event.target.value })}
                  />
                </Field>
                <Field
                  label={t('newGroup.to')}
                  error={submitted && badTime(row) ? t('newGroup.invalidTime') : undefined}
                >
                  <Input
                    type="time"
                    value={row.endTime}
                    onChange={(event) => updateRow(row.key, { endTime: event.target.value })}
                  />
                </Field>
              </Grid>
              <Button
                variant="ghost"
                size="sm"
                leftIcon={<TrashIcon />}
                onClick={() => setSchedule((rows) => rows.filter((r) => r.key !== row.key))}
              >
                {t('newGroup.removeDay')}
              </Button>
            </Stack>
          </Card>
        ))}
        <Button variant="secondary" leftIcon={<PlusIcon />} onClick={addRow} fullWidth>
          {t('newGroup.addDay')}
        </Button>
      </Stack>

      <Button fullWidth loading={create.isPending} onClick={() => void onSubmit()}>
        {t('newGroup.submit')}
      </Button>
    </Stack>
  );
}
