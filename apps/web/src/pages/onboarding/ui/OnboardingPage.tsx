import { type AiMessageDto, type OnboardingProfileDraft, STREAMING_ROUTES } from '@edu/contracts';
import {
  AppLayout,
  Button,
  Card,
  Checkbox,
  EmptyState,
  Inline,
  PageHeader,
  Screen,
  Stack,
  Text,
  Textarea,
  useToast,
} from '@edu/ui';
import { useEffect, useRef, useState, type FormEvent } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate } from 'react-router';
import {
  ChatMessage,
  useCompleteOnboarding,
  useOnboardingRecommendations,
  useStartOnboarding,
} from '@/entities/ai';
import { ClubCard } from '@/entities/club';
import { describeApiError } from '@/shared/api/errors';
import { useAiStream } from '@/shared/api/sse';
import { roleHomePath } from '@/shared/auth/role-routes';
import { config } from '@/shared/config';
import { AsyncState } from '@/shared/ui';

const EMPTY_PROFILE: OnboardingProfileDraft = {
  interests: [],
  goals: [],
  weeklyHours: 0,
  preferredFormats: [],
  summary: '',
};

/**
 * Онбординг с ИИ (F1): диалог 4–7 реплик через SSE → `done.isComplete` + profileDraft →
 * рекомендованные кружки → выбор → `POST /student/onboarding/complete` → главная.
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
  const [draft, setDraft] = useState('');
  const [pendingUserText, setPendingUserText] = useState<string | null>(null);
  const [profile, setProfile] = useState<OnboardingProfileDraft | null>(null);
  const [selected, setSelected] = useState<string[]>([]);
  const startedRef = useRef(false);
  const recommendations = useOnboardingRecommendations(profile !== null);

  useEffect(() => {
    if (startedRef.current) return;
    startedRef.current = true;
    start.mutate(undefined, {
      onSuccess: (result) => {
        setConversationId(result.conversationId);
        setMessages([result.message]);
      },
    });
    // eslint-disable-next-line react-hooks/exhaustive-deps
  }, []);

  const goHome = () => navigate(roleHomePath('STUDENT'), { replace: true });

  const onSend = async (event: FormEvent) => {
    event.preventDefault();
    const text = draft.trim();
    if (!text || !conversationId || stream.isStreaming) return;
    setDraft('');
    setPendingUserText(text);
    const result = await stream.start(STREAMING_ROUTES.onboardingMessage.path, {
      conversationId,
      text,
    });
    if (result.status === 'done') {
      const now = new Date().toISOString();
      setMessages((prev) => [
        ...prev,
        { id: `${now}-u`, conversationId, role: 'USER', content: text, createdAt: now },
        {
          id: result.messageId ?? `${now}-a`,
          conversationId,
          role: 'ASSISTANT',
          content: result.text,
          createdAt: now,
        },
      ]);
      setPendingUserText(null);
      stream.reset();
      if (result.done?.isComplete) {
        const parsed = result.done.profileDraft as OnboardingProfileDraft | undefined;
        setProfile(parsed ?? EMPTY_PROFILE);
      }
    }
  };

  const finish = (profileDraft: OnboardingProfileDraft, clubIds: string[]) =>
    complete.mutate(
      { selectedClubIds: clubIds, profileDraft },
      {
        onSuccess: goHome,
        onError: (error) => toast.show({ tone: 'danger', title: describeApiError(error) }),
      },
    );

  const toggle = (clubId: string) =>
    setSelected((prev) =>
      prev.includes(clubId) ? prev.filter((id) => id !== clubId) : [...prev, clubId],
    );

  return (
    <AppLayout header={<PageHeader title={t('onboarding.title')} />}>
      <AppLayout.Content>
        <Screen>
          {profile === null ? (
            <>
              <Card>
                <Stack gap={2}>
                  <Text tone="muted">{t('onboarding.description')}</Text>
                  {start.isError && (
                    <Text tone="danger" role="alert">
                      {describeApiError(start.error)}
                    </Text>
                  )}
                  {messages.map((message) => (
                    <ChatMessage key={message.id} role={message.role} content={message.content} />
                  ))}
                  {pendingUserText && <ChatMessage role="USER" content={pendingUserText} />}
                  {(stream.isStreaming || stream.text) && (
                    <ChatMessage
                      role="ASSISTANT"
                      content={stream.text}
                      streaming={stream.isStreaming}
                    />
                  )}
                  {stream.status === 'error' && stream.error && (
                    <Text tone="danger" role="alert">
                      {describeApiError(stream.error)}
                    </Text>
                  )}
                </Stack>
              </Card>
              <form onSubmit={(event) => void onSend(event)}>
                <Stack gap={2}>
                  <Textarea
                    value={draft}
                    onChange={(event) => setDraft(event.target.value)}
                    placeholder={t('onboarding.placeholder')}
                    rows={2}
                    disabled={!conversationId || stream.isStreaming}
                  />
                  <Inline justify="between">
                    {config.isDev ? (
                      <Button
                        variant="ghost"
                        size="sm"
                        loading={complete.isPending}
                        onClick={() => finish(EMPTY_PROFILE, [])}
                      >
                        {t('onboarding.skip')}
                      </Button>
                    ) : (
                      <span />
                    )}
                    <Button
                      type="submit"
                      disabled={!draft.trim() || !conversationId}
                      loading={stream.isStreaming}
                    >
                      {t('onboarding.send')}
                    </Button>
                  </Inline>
                </Stack>
              </form>
            </>
          ) : (
            <Stack gap={3}>
              <Card>
                <Stack gap={1}>
                  <Text weight="medium">{t('onboarding.recommendationsTitle')}</Text>
                  <Text variant="caption" tone="muted">
                    {profile.summary || t('onboarding.recommendationsHint')}
                  </Text>
                </Stack>
              </Card>
              <AsyncState
                query={recommendations}
                isEmpty={(data) => data.items.length === 0}
                empty={<EmptyState title={t('onboarding.noClubs')} />}
              >
                {(data) => (
                  <Stack gap={3}>
                    {data.items.map((item) => (
                      <ClubCard
                        key={item.club.id}
                        club={item.club}
                        extra={
                          <Stack gap={1}>
                            <Text variant="caption">{item.reason}</Text>
                            <Checkbox
                              label={t('onboarding.choose')}
                              checked={selected.includes(item.club.id)}
                              onChange={() => toggle(item.club.id)}
                            />
                          </Stack>
                        }
                      />
                    ))}
                  </Stack>
                )}
              </AsyncState>
              <Button
                fullWidth
                loading={complete.isPending}
                onClick={() => finish(profile, selected)}
              >
                {selected.length > 0
                  ? t('onboarding.finishWithClubs', { count: selected.length })
                  : t('onboarding.finishWithout')}
              </Button>
            </Stack>
          )}
        </Screen>
      </AppLayout.Content>
    </AppLayout>
  );
}
