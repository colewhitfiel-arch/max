import {
  type AiMessageDto,
  type ClubCard as ClubCardDto,
  type ClubRecommendation,
  type OnboardingProfileDraft,
  type OnboardingStreamEvent,
  STREAMING_ROUTES,
} from '@edu/contracts';
import {
  AppLayout,
  Button,
  Card,
  ChatComposer,
  ChevronRightIcon,
  Chip,
  EmptyState,
  IconButton,
  Inline,
  Screen,
  Stack,
  Tag,
  Text,
  useToast,
} from '@edu/ui';
import { useEffect, useRef, useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  ChatMessage,
  scrollFeedToEnd,
  TutorAvatar,
  useCompleteOnboarding,
  useOnboardingRecommendations,
  useStartOnboarding,
} from '@/entities/ai';
import { ClubCard } from '@/entities/club';
import { describeApiError } from '@/shared/api/errors';
import { useAiStream } from '@/shared/api/sse';
import { useMe } from '@/shared/auth/hooks';
import { roleHomePath } from '@/shared/auth/role-routes';
import { config } from '@/shared/config';
import { AsyncState, QueryError, ScreenHeader } from '@/shared/ui';

const EMPTY_PROFILE: OnboardingProfileDraft = {
  interests: [],
  goals: [],
  weeklyHours: 0,
  preferredFormats: [],
  futureInterests: [],
  summary: '',
};

/** Что ученик решил по кружку: записаться сейчас или отметить «попробовать позже». */
type Choice = 'now' | 'later';

/** Приветствие над лентой: аватар тьютора, имя ученика и что сейчас будет. */
function Hero() {
  const { t } = useTranslation('auth');
  const name = useMe()?.user.firstName.trim();
  return (
    <Stack gap={3} align="center">
      <TutorAvatar size="xl" />
      <Stack gap={1} align="center">
        <Text variant="title" align="center">
          {name ? t('onboarding.hero', { name }) : t('onboarding.heroAnon')}
        </Text>
        <Text variant="small" tone="muted" align="center">
          {t('onboarding.heroHint')}
        </Text>
      </Stack>
    </Stack>
  );
}

interface ChatStageProps {
  messages: AiMessageDto[];
  /** Сообщения, которые появляются плавно (новое приветствие); остальные — сразу. */
  appearIds: ReadonlySet<string>;
  /** Кружки, предложенные последней репликой тьютора: кнопки быстрого ответа. */
  clubOptions: ClubCardDto[];
  /** Ученик выбрал кружок кнопкой (название уходит ответом) — отметить его к записи. */
  onPickClub: (club: ClubCardDto) => void;
  pendingUserText: string | null;
  streamText: string;
  streaming: boolean;
  streamError: unknown;
  startError: unknown;
  onRetryStart: () => void;
  canSend: boolean;
  /** `true` — ответ принят; `false` — не ушёл (ошибка стрима), текст вернётся в поле ввода. */
  onSend: (text: string) => Promise<boolean>;
  onStop: () => void;
}

/**
 * Этап знакомства: лента как в чате тьютора и «пилюля» ввода у нижнего края. Новые сообщения
 * (приветствие, ответ ученика, реплика тьютора) появляются плавно; если тьютор предложил кружки —
 * под его репликой кнопки, кружок выбирается одним нажатием, без ввода названия.
 */
function ChatStage({
  messages,
  appearIds,
  clubOptions,
  onPickClub,
  pendingUserText,
  streamText,
  streaming,
  streamError,
  startError,
  onRetryStart,
  canSend,
  onSend,
  onStop,
}: ChatStageProps) {
  const { t } = useTranslation('auth');
  const [draft, setDraft] = useState('');
  const bottomRef = useRef<HTMLDivElement>(null);

  // Прокручиваем скролл-область, а не маркер: иначе конец реплики и кнопки кружков остаются
  // под липкой «пилюлей» ввода.
  useEffect(() => {
    scrollFeedToEnd(bottomRef.current);
  }, [messages.length, pendingUserText, streamText, clubOptions.length]);

  const submit = (text: string) =>
    void onSend(text).then((sent) => {
      // Не ушло — вернуть ответ в поле, если ученик не начал набирать новый.
      if (!sent) setDraft((current) => current || text);
    });

  const showOptions = clubOptions.length > 0 && canSend && !streaming && !pendingUserText;

  return (
    <Screen fill>
      <Stack gap={3} grow justify="end" aria-live="polite">
        <Hero />
        {startError != null && <QueryError error={startError} onRetry={onRetryStart} />}
        {messages.map((message) => (
          <ChatMessage
            key={message.id}
            role={message.role}
            content={message.content}
            appear={appearIds.has(message.id)}
          />
        ))}
        {showOptions && (
          <Inline gap={2} role="group" aria-label={t('onboarding.clubOptions')}>
            {clubOptions.map((club) => (
              <Chip
                key={club.id}
                onClick={() => {
                  onPickClub(club);
                  submit(club.title);
                }}
              >
                {club.title}
              </Chip>
            ))}
          </Inline>
        )}
        {pendingUserText && <ChatMessage role="USER" content={pendingUserText} appear />}
        {(streaming || streamText) && (
          <ChatMessage role="ASSISTANT" content={streamText} streaming={streaming} appear />
        )}
        {streamError != null && (
          <Text variant="small" tone="danger" align="center" role="alert">
            {describeApiError(streamError)}
          </Text>
        )}
        <div ref={bottomRef} aria-hidden="true" />
      </Stack>
      <ChatComposer
        sticky
        autoFocus
        value={draft}
        onChange={setDraft}
        onSubmit={(text) => {
          setDraft('');
          submit(text);
        }}
        disabled={!canSend}
        busy={streaming}
        onStop={onStop}
        placeholder={t('onboarding.placeholder')}
        inputLabel={t('common:chat.inputLabel')}
        sendLabel={t('onboarding.send')}
        stopLabel={t('onboarding.stop')}
      />
    </Screen>
  );
}

/** Карточка «вот что я понял»: итог профиля таблетками. */
function ProfileSummary({ profile }: { profile: OnboardingProfileDraft }) {
  const { t } = useTranslation('auth');
  const rows: Array<{ key: string; label: string; items: string[]; tone: 'info' | 'neutral' }> = [
    { key: 'interests', label: t('onboarding.interests'), items: profile.interests, tone: 'info' },
    { key: 'goals', label: t('onboarding.goals'), items: profile.goals, tone: 'neutral' },
    {
      key: 'formats',
      label: t('onboarding.formats'),
      items: profile.preferredFormats,
      tone: 'neutral',
    },
  ];
  return (
    <Card>
      <Stack gap={3}>
        <Inline gap={3} wrap={false}>
          <TutorAvatar size="md" />
          <Stack gap={0}>
            <Text weight="medium">{t('onboarding.profileTitle')}</Text>
            {profile.weeklyHours > 0 && (
              <Text variant="caption" tone="muted">
                {t('onboarding.hours', { count: profile.weeklyHours })}
              </Text>
            )}
          </Stack>
        </Inline>
        {profile.summary && <Text variant="small">{profile.summary}</Text>}
        {rows
          .filter((row) => row.items.length > 0)
          .map((row) => (
            <Stack key={row.key} gap={1}>
              <Text variant="caption" tone="muted">
                {row.label}
              </Text>
              <Inline gap={1} wrap>
                {row.items.map((item) => (
                  <Tag key={item} tone={row.tone}>
                    {item}
                  </Tag>
                ))}
              </Inline>
            </Stack>
          ))}
        {profile.futureInterests.length > 0 && (
          <Stack gap={1}>
            <Text variant="caption" tone="muted">
              {t('onboarding.futureLabel')}
            </Text>
            <Inline gap={1} wrap>
              {profile.futureInterests.map((item) => (
                <Tag key={item} tone="warning">
                  {item}
                </Tag>
              ))}
            </Inline>
          </Stack>
        )}
      </Stack>
    </Card>
  );
}

interface ClubChoiceProps {
  item: ClubRecommendation;
  choice: Choice | undefined;
  onPick: (choice: Choice) => void;
}

/** Карточка кружка с причиной от тьютора и двумя взаимоисключающими чипами. */
function ClubChoice({ item, choice, onPick }: ClubChoiceProps) {
  const { t } = useTranslation('auth');
  return (
    <ClubCard
      club={item.club}
      extra={
        <Stack gap={2}>
          <Inline gap={2} wrap={false}>
            <TutorAvatar size="sm" />
            <Text variant="caption">{item.reason}</Text>
          </Inline>
          <Inline gap={2} role="group" aria-label={item.club.title}>
            <Chip selected={choice === 'now'} onClick={() => onPick('now')}>
              {t('onboarding.choose')}
            </Chip>
            <Chip selected={choice === 'later'} onClick={() => onPick('later')}>
              {t('onboarding.later')}
            </Chip>
          </Inline>
        </Stack>
      }
    />
  );
}

/**
 * Онбординг с ИИ (F1): диалог 4–7 реплик через SSE → `done.isComplete` + profileDraft →
 * рекомендованные кружки → «записаться» / «попробовать позже» → `POST /student/onboarding/complete`
 * → главная. Визуально — тот же чат, что у тьютора: диалог знакомства им и продолжается.
 */
export function OnboardingPage() {
  const { t } = useTranslation('auth');
  const navigate = useNavigate();
  const toast = useToast();
  const start = useStartOnboarding();
  const complete = useCompleteOnboarding();
  const stream = useAiStream();
  const [conversationId, setConversationId] = useState<string | null>(null);
  const [messages, setMessages] = useState<AiMessageDto[]>([]);
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [profile, setProfile] = useState<OnboardingProfileDraft | null>(null);
  const [choices, setChoices] = useState<Record<string, Choice>>({});
  // Плавно появляется только новое приветствие; продолженный диалог восстанавливается сразу.
  const [appearIds, setAppearIds] = useState<ReadonlySet<string>>(() => new Set());
  const [clubOptions, setClubOptions] = useState<ClubCardDto[]>([]);
  // Кружки, выбранные кнопкой в разговоре: на экране выбора они уже отмечены «Записаться».
  const [pickedClubs, setPickedClubs] = useState<ClubCardDto[]>([]);
  const startedRef = useRef(false);
  const presetRef = useRef(false);
  const topRef = useRef<HTMLDivElement>(null);
  const recommendations = useOnboardingRecommendations(profile !== null);

  // После чата лента прокручена вниз — экран выбора кружков начинаем с верха.
  useEffect(() => {
    if (profile !== null) topRef.current?.scrollIntoView({ block: 'start' });
  }, [profile]);

  // Рекомендации пришли — кружки, выбранные кнопкой в разговоре, сразу отмечены «Записаться»
  // (ученик может снять отметку). Один раз: дальше выбор только за учеником.
  useEffect(() => {
    if (!recommendations.data || presetRef.current) return;
    presetRef.current = true;
    if (pickedClubs.length === 0) return;
    setChoices((prev) => ({
      ...Object.fromEntries(pickedClubs.map((club) => [club.id, 'now' as const])),
      ...prev,
    }));
  }, [recommendations.data, pickedClubs]);

  const startConversation = () =>
    start.mutate(undefined, {
      onSuccess: (result) => {
        setConversationId(result.conversationId);
        // Незавершённое знакомство продолжается с той же ленты (обновили страницу).
        setMessages(result.history ?? [result.message]);
        setAppearIds(result.history ? new Set() : new Set([result.message.id]));
        setClubOptions(result.clubOptions ?? []);
        if (result.profileDraft) setProfile(result.profileDraft);
      },
    });

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    startConversation();
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goHome = () => navigate(roleHomePath('STUDENT'), { replace: true });

  const send = async (text: string): Promise<boolean> => {
    if (!text.trim() || !conversationId || stream.isStreaming) return false;
    const previousOptions = clubOptions;
    setClubOptions([]);
    setPendingUserText(text);
    const result = await stream.start(STREAMING_ROUTES.onboardingMessage.path, {
      conversationId,
      text,
    });
    setPendingUserText(null);
    if (result.status !== 'done') {
      // Ответ не ушёл — кнопки кружков возвращаются вместе с текстом в поле.
      setClubOptions(previousOptions);
      return false;
    }
    const now = new Date().toISOString();
    const userMessage: AiMessageDto = {
      id: `${now}-u`,
      conversationId,
      role: 'USER',
      content: text,
      createdAt: now,
    };
    // «Остановить» до первого токена даёт пустой ответ — пустой пузырь не добавляем.
    const assistantMessage: AiMessageDto[] = result.text
      ? [
          {
            id: result.messageId ?? `${now}-a`,
            conversationId,
            role: 'ASSISTANT',
            content: result.text,
            createdAt: now,
          },
        ]
      : [];
    setMessages((prev) => [...prev, userMessage, ...assistantMessage]);
    stream.reset();
    const done = result.done as Extract<OnboardingStreamEvent, { type: 'done' }> | null;
    if (done?.isComplete) {
      setProfile(done.profileDraft ?? EMPTY_PROFILE);
    } else if (result.text) {
      setClubOptions(done?.clubOptions ?? []);
    }
    return true;
  };

  /** Рекомендации + кружки, выбранные кнопкой в разговоре, но не попавшие в подборку (первыми). */
  const withPicked = (items: ClubRecommendation[]): ClubRecommendation[] => [
    ...pickedClubs
      .filter((club) => !items.some((item) => item.club.id === club.id))
      .map((club) => ({ club, reason: t('onboarding.pickedReason'), score: 1 })),
    ...items,
  ];

  const pickClub = (club: ClubCardDto) =>
    setPickedClubs((prev) => (prev.some((c) => c.id === club.id) ? prev : [...prev, club]));

  const idsWith = (choice: Choice) =>
    Object.entries(choices)
      .filter(([, value]) => value === choice)
      .map(([clubId]) => clubId);
  const selected = idsWith('now');
  const later = idsWith('later');

  const finish = (profileDraft: OnboardingProfileDraft, clubIds: string[], laterIds: string[]) =>
    complete.mutate(
      { selectedClubIds: clubIds, laterClubIds: laterIds, profileDraft },
      {
        onSuccess: goHome,
        onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
      },
    );

  /** Повторный клик по активному варианту снимает выбор; варианты взаимоисключающие. */
  const pick = (clubId: string, choice: Choice) =>
    setChoices((prev) => {
      const next = { ...prev };
      if (next[clubId] === choice) delete next[clubId];
      else next[clubId] = choice;
      return next;
    });

  const answered = messages.filter((m) => m.role === 'USER').length + (pendingUserText ? 1 : 0);
  const subtitle = stream.isStreaming
    ? t('onboarding.typing')
    : profile
      ? t('onboarding.stepClubs')
      : t('onboarding.stepChat', { n: answered + 1 });

  // Шапка — в слоте раскладки, а не внутри скролл-области: иначе «пилюля» ввода прижимается
  // на высоту шапки ниже конца ленты и закрывает последнее сообщение.
  const header = (
    <ScreenHeader
      title={t('onboarding.title')}
      subtitle={subtitle}
      actions={
        config.isDev && profile === null ? (
          <IconButton
            aria-label={t('onboarding.skip')}
            title={t('onboarding.skip')}
            loading={complete.isPending}
            onClick={() => finish(EMPTY_PROFILE, [], [])}
          >
            <ChevronRightIcon />
          </IconButton>
        ) : undefined
      }
    />
  );

  return (
    <AppLayout header={header}>
      <AppLayout.Content>
        {profile === null ? (
          <ChatStage
            messages={messages}
            appearIds={appearIds}
            clubOptions={clubOptions}
            onPickClub={pickClub}
            pendingUserText={pendingUserText}
            streamText={stream.text}
            streaming={stream.isStreaming}
            streamError={stream.status === 'error' ? stream.error : null}
            startError={start.isError ? start.error : null}
            onRetryStart={startConversation}
            canSend={conversationId !== null}
            onSend={send}
            onStop={stream.abort}
          />
        ) : (
          <Screen>
            <div ref={topRef} aria-hidden="true" />
            <ProfileSummary profile={profile} />
            <Stack gap={1}>
              <Text weight="medium">{t('onboarding.recommendationsTitle')}</Text>
              <Text variant="caption" tone="muted">
                {t('onboarding.choiceHint')}
              </Text>
            </Stack>
            <AsyncState
              query={recommendations}
              isEmpty={(data) => withPicked(data.items).length === 0}
              empty={<EmptyState title={t('onboarding.noClubs')} />}
            >
              {(data) => (
                <Stack gap={3}>
                  {withPicked(data.items).map((item) => (
                    <ClubChoice
                      key={item.club.id}
                      item={item}
                      choice={choices[item.club.id]}
                      onPick={(choice) => pick(item.club.id, choice)}
                    />
                  ))}
                </Stack>
              )}
            </AsyncState>
            <Button
              fullWidth
              size="lg"
              loading={complete.isPending}
              onClick={() => finish(profile, selected, later)}
            >
              {selected.length > 0
                ? t('onboarding.finishWithClubs', { count: selected.length })
                : later.length > 0
                  ? t('onboarding.finishWithLater', { count: later.length })
                  : t('onboarding.finishWithout')}
            </Button>
          </Screen>
        )}
      </AppLayout.Content>
    </AppLayout>
  );
}
