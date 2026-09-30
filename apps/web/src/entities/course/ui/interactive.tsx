import type { InteractiveContent } from '@edu/contracts';
import {
  Badge,
  Button,
  Card,
  CheckIcon,
  Chip,
  Field,
  Inline,
  Input,
  ProgressBar,
  RefreshIcon,
  Stack,
  Text,
} from '@edu/ui';
import { useMemo, useState } from 'react';
import { useTranslation } from 'react-i18next';

type Flashcards = Extract<InteractiveContent, { kind: 'FLASHCARDS' }>['data'];
type Matching = Extract<InteractiveContent, { kind: 'MATCHING' }>['data'];
type FillGaps = Extract<InteractiveContent, { kind: 'FILL_GAPS' }>['data'];

/** Перемешать один раз на монтирование (Фишер — Йейтс); исходный массив не меняется. */
function shuffled<T>(items: readonly T[]): T[] {
  const copy = [...items];
  for (let i = copy.length - 1; i > 0; i -= 1) {
    const j = Math.floor(Math.random() * (i + 1));
    [copy[i], copy[j]] = [copy[j]!, copy[i]!];
  }
  return copy;
}

/**
 * Карточки: тап переворачивает («вопрос» ↔ «ответ»), «Знаю» убирает карточку из колоды,
 * «Ещё раз» отправляет в конец. Колода пройдена — можно начать заново.
 */
export function FlashcardsExercise({ data }: { data: Flashcards }) {
  const { t } = useTranslation('student');
  const [deck, setDeck] = useState(() => data.cards.map((_, index) => index));
  const [flipped, setFlipped] = useState(false);
  const total = data.cards.length;
  const current = deck[0];
  const card = current === undefined ? undefined : data.cards[current];

  const next = (known: boolean) => {
    setFlipped(false);
    setDeck(([first, ...rest]) => (known || first === undefined ? rest : [...rest, first]));
  };

  if (!card) {
    return (
      <Stack gap={3} align="center">
        <Badge tone="success">{t('player.flashcards.done', { count: total })}</Badge>
        <Button
          variant="secondary"
          leftIcon={<RefreshIcon />}
          onClick={() => setDeck(data.cards.map((_, index) => index))}
        >
          {t('player.flashcards.again')}
        </Button>
      </Stack>
    );
  }

  return (
    <Stack gap={3}>
      <ProgressBar
        value={total - deck.length}
        max={total}
        tone="success"
        size="sm"
        label={t('player.flashcards.progress', { done: total - deck.length, total })}
      />
      <Card
        interactive
        onClick={() => setFlipped((value) => !value)}
        aria-label={flipped ? t('player.flashcards.showFront') : t('player.flashcards.showBack')}
      >
        <Stack gap={2} align="center">
          <Text variant="caption" tone="muted">
            {flipped ? t('player.flashcards.back') : t('player.flashcards.front')}
          </Text>
          <Text variant="title" as="p" align="center">
            {flipped ? card.back : card.front}
          </Text>
          <Text variant="caption" tone="muted">
            {t('player.flashcards.tapHint')}
          </Text>
        </Stack>
      </Card>
      <Inline gap={2} justify="center">
        <Button variant="secondary" onClick={() => next(false)}>
          {t('player.flashcards.repeat')}
        </Button>
        <Button leftIcon={<CheckIcon />} onClick={() => next(true)}>
          {t('player.flashcards.known')}
        </Button>
      </Inline>
    </Stack>
  );
}

/**
 * Сопоставление: выбери понятие слева и его пару справа. Верная пара уходит в список найденных,
 * неверная — подсказка «не пара». Все пары найдены — упражнение выполнено.
 */
export function MatchingExercise({ data }: { data: Matching }) {
  const { t } = useTranslation('student');
  const rights = useMemo(
    () => shuffled(data.pairs.map((pair, index) => ({ ...pair, index }))),
    [data],
  );
  const [matched, setMatched] = useState<number[]>([]);
  const [left, setLeft] = useState<number | null>(null);
  const [miss, setMiss] = useState(false);

  const pickRight = (index: number) => {
    if (left === null) return;
    if (left === index) {
      setMatched((prev) => [...prev, index]);
      setMiss(false);
    } else {
      setMiss(true);
    }
    setLeft(null);
  };

  const done = matched.length === data.pairs.length;
  return (
    <Stack gap={3}>
      {!done && (
        <>
          <Text variant="caption" tone="muted">
            {left === null ? t('player.matching.pickLeft') : t('player.matching.pickRight')}
          </Text>
          <Stack gap={1}>
            <Text variant="caption" weight="medium">
              {t('player.matching.terms')}
            </Text>
            <Inline gap={2}>
              {data.pairs.map((pair, index) =>
                matched.includes(index) ? null : (
                  <Chip
                    key={`l-${index}`}
                    selected={left === index}
                    onClick={() => {
                      setMiss(false);
                      setLeft(left === index ? null : index);
                    }}
                  >
                    {pair.left}
                  </Chip>
                ),
              )}
            </Inline>
          </Stack>
          <Stack gap={1}>
            <Text variant="caption" weight="medium">
              {t('player.matching.definitions')}
            </Text>
            <Inline gap={2}>
              {rights.map((pair) =>
                matched.includes(pair.index) ? null : (
                  <Chip key={`r-${pair.index}`} onClick={() => pickRight(pair.index)}>
                    {pair.right}
                  </Chip>
                ),
              )}
            </Inline>
          </Stack>
          {miss && (
            <Text variant="small" tone="danger" role="status">
              {t('player.matching.miss')}
            </Text>
          )}
        </>
      )}
      {matched.length > 0 && (
        <Stack gap={1}>
          {done && <Badge tone="success">{t('player.matching.done')}</Badge>}
          {matched.map((index) => (
            <Inline key={`m-${index}`} gap={1} align="start" wrap={false}>
              <CheckIcon size={16} />
              <Text variant="small" tone="success">
                {data.pairs[index]!.left} — {data.pairs[index]!.right}
              </Text>
            </Inline>
          ))}
        </Stack>
      )}
    </Stack>
  );
}

const GAP = /\{\{([^}]+)\}\}/g;

/** Ответ на пропуск: регистр, «ё» и лишние пробелы не важны; варианты через «|». */
function normalize(value: string): string {
  return value.trim().toLowerCase().replace(/ё/g, 'е').replace(/\s+/g, ' ');
}

export function isGapAnswerCorrect(answer: string, expected: string): boolean {
  const given = normalize(answer);
  return given !== '' && expected.split('|').some((option) => normalize(option) === given);
}

/**
 * Текст с пропусками `{{ответ}}`: пропуски пронумерованы в тексте, ответы вписываются в поля
 * под ним. «Проверить» подсвечивает верные и неверные; после проверки видны правильные ответы.
 */
export function FillGapsExercise({ data }: { data: FillGaps }) {
  const { t } = useTranslation('student');
  const gaps = useMemo(() => [...data.text.matchAll(GAP)].map((m) => (m[1] ?? '').trim()), [data]);
  const [answers, setAnswers] = useState<string[]>(() => gaps.map(() => ''));
  const [checked, setChecked] = useState(false);

  let n = 0;
  const masked = data.text.replace(GAP, () => `[ ${(n += 1)} ]`);
  const results = gaps.map((expected, index) => isGapAnswerCorrect(answers[index] ?? '', expected));
  const correct = results.filter(Boolean).length;
  const primary = (expected: string) => expected.split('|')[0]!.trim();

  return (
    <Stack gap={3}>
      <Card>
        <Text preserveLines>{masked}</Text>
      </Card>
      <Stack gap={2}>
        {gaps.map((expected, index) => (
          <Field
            key={index}
            label={t('player.gaps.gap', { n: index + 1 })}
            error={
              checked && !results[index]
                ? t('player.gaps.expected', { answer: primary(expected) })
                : undefined
            }
            hint={checked && results[index] ? t('player.gaps.right') : undefined}
          >
            <Input
              value={answers[index] ?? ''}
              onChange={(event) => {
                const value = event.target.value;
                setChecked(false);
                setAnswers((prev) => prev.map((item, i) => (i === index ? value : item)));
              }}
              autoCapitalize="none"
              autoComplete="off"
            />
          </Field>
        ))}
      </Stack>
      <Inline gap={2} align="center">
        <Button
          variant="secondary"
          onClick={() => setChecked(true)}
          disabled={answers.every((a) => !a.trim())}
        >
          {t('player.gaps.check')}
        </Button>
        {checked && (
          <Badge tone={correct === gaps.length ? 'success' : 'warning'}>
            {t('player.gaps.score', { correct, total: gaps.length })}
          </Badge>
        )}
      </Inline>
    </Stack>
  );
}
