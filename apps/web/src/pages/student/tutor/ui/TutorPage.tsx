import { EditIcon, IconButton, MenuIcon, Screen, Text } from '@edu/ui';
import { useState } from 'react';
import { useTranslation } from 'react-i18next';
import { useNavigate, useParams } from 'react-router';
import { ScreenHeader } from '@/shared/ui';
import { ChatHistoryDrawer } from './ChatHistoryDrawer';
import { TutorChat } from './TutorChat';

/** Корень чата: новый чат. Открытый диалог — `/student/tutor/:conversationId`. */
const TUTOR_PATH = '/student/tutor';

interface ChatSession {
  /** Диалог из адреса, для которого посчитан `key`. */
  urlId: string | undefined;
  /** Ключ ленты: меняется, когда пользователь открывает другой чат или новый. */
  key: number;
  /** Диалог, который создала первая отправка текущей ленты: переход на его адрес — та же лента. */
  adopted: string | null;
}

/**
 * `/student/tutor[/:conversationId]` — чаты с ИИ-тьютором (F4) в духе ChatGPT: пункт меню
 * «ИИ-тьютор» открывает новый чат, «Новый чат» в шапке — тоже; слева — история прошлых чатов
 * (боковая панель), из неё открывается любой старый чат. Диалоги и сообщения хранятся в БД;
 * новый чат создаётся на сервере первой отправкой, адрес сразу переходит на него.
 */
export function TutorPage() {
  const { t } = useTranslation('student');
  const navigate = useNavigate();
  const { conversationId } = useParams<{ conversationId?: string }>();
  const [streaming, setStreaming] = useState(false);
  const [historyOpen, setHistoryOpen] = useState(false);
  const [session, setSession] = useState<ChatSession>({
    urlId: conversationId,
    key: 0,
    adopted: null,
  });

  // Смена адреса = другой чат, кроме перехода нового чата на только что созданный им диалог:
  // там лента та же (идёт первый ответ), пересоздавать её нельзя.
  if (session.urlId !== conversationId) {
    const adopted = session.urlId === undefined && conversationId === session.adopted;
    setSession({
      urlId: conversationId,
      key: adopted ? session.key : session.key + 1,
      adopted: null,
    });
  }

  const startNewChat = () => {
    setHistoryOpen(false);
    if (conversationId) navigate(TUTOR_PATH);
    else setSession((current) => ({ ...current, key: current.key + 1, adopted: null }));
  };

  const openChat = (id: string) => {
    setHistoryOpen(false);
    if (id !== conversationId) navigate(`${TUTOR_PATH}/${id}`);
  };

  // Шапка и чат — одна колонка ровно в высоту области (`fill` + `grow`): пустой чат не
  // прокручивается на высоту шапки, длинная лента прокручивается под липкими шапкой и полем.
  return (
    <Screen padding="none" gap={0} fill>
      <ScreenHeader
        title={t('tutor.title')}
        subtitle={streaming ? t('tutor.typing') : t('tutor.online')}
        leading={
          <IconButton
            aria-label={t('tutor.history')}
            aria-haspopup="dialog"
            aria-expanded={historyOpen}
            onClick={() => setHistoryOpen(true)}
          >
            <Text as="span" tone="muted">
              <MenuIcon size={26} />
            </Text>
          </IconButton>
        }
        actions={
          <IconButton
            aria-label={t('tutor.newChat')}
            title={t('tutor.newChat')}
            onClick={startNewChat}
          >
            <Text as="span" tone="muted">
              <EditIcon size={24} />
            </Text>
          </IconButton>
        }
        bell
        sticky
      />
      <TutorChat
        key={session.key}
        conversationId={conversationId ?? null}
        onStreamingChange={setStreaming}
        onConversationCreated={(id) => {
          setSession((current) => ({ ...current, adopted: id }));
          navigate(`${TUTOR_PATH}/${id}`, { replace: true });
        }}
      />
      <ChatHistoryDrawer
        open={historyOpen}
        onClose={() => setHistoryOpen(false)}
        activeId={conversationId ?? null}
        onSelect={openChat}
        onNewChat={startNewChat}
        onDeleted={(id) => {
          if (id === conversationId) navigate(TUTOR_PATH, { replace: true });
        }}
      />
    </Screen>
  );
}
