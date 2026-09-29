import {
  isHttpUrl,
  type InteractiveContent,
  type StudentBlockDetail,
  type VideoContent,
} from '@edu/contracts';
import { Button, Card, Divider, LinkIcon, Markdown, Stack, Text, useToast } from '@edu/ui';
import { useTranslation } from 'react-i18next';
import { useMaxBridge } from '@/shared/max';

function hostOf(url: string): string | null {
  try {
    return new URL(url).hostname;
  } catch {
    return null;
  }
}

/**
 * Видео-блок: ссылка на внешний плеер открывается через MaxBridge (в MAX — `openLink` SDK).
 * Без ссылки (provider `file` до модуля файлов) или со ссылкой не http(s) — «видео недоступно»:
 * контракт такие ссылки не пропускает, проверка здесь — защита в глубину перед openLink.
 */
function VideoBlock({ content }: { content: VideoContent }) {
  const { t } = useTranslation('student');
  const bridge = useMaxBridge();
  const { url } = content;
  if (!url || !isHttpUrl(url)) return <Text tone="muted">{t('courses.videoUnavailable')}</Text>;
  const host = hostOf(url);
  return (
    <Stack gap={1} align="start">
      <Button variant="link" rightIcon={<LinkIcon />} onClick={() => bridge.openLink(url)}>
        {t('courses.openVideo')}
      </Button>
      {host && (
        <Text variant="caption" tone="muted">
          {host}
        </Text>
      )}
    </Stack>
  );
}

/**
 * Текстовый блок: Markdown из конструктора курса (GigaChat) — заголовки, выделение, списки,
 * код. Ссылки (только http(s)) открываются через MaxBridge, как видео.
 */
function TextBlock({ markdown }: { markdown: string }) {
  const { t } = useTranslation('student');
  const bridge = useMaxBridge();
  const toast = useToast();
  return (
    <Markdown
      source={markdown}
      onLinkClick={(href) => bridge.openLink(href)}
      copyLabel={t('courses.copyCode')}
      copiedLabel={t('courses.codeCopied')}
      onCopyResult={(ok) => {
        if (!ok) toast.show({ tone: 'danger', title: t('courses.copyCodeFailed') });
      }}
    />
  );
}

/** Интерактивный блок: карточки, пары и текст с пропусками — пока просто читаемый материал. */
function InteractiveBlock({ content }: { content: InteractiveContent }) {
  switch (content.kind) {
    case 'FLASHCARDS':
      return (
        <Stack gap={2}>
          {content.data.cards.map((card, index) => (
            <Stack key={`${card.front}-${index}`} gap={1}>
              {index > 0 && <Divider />}
              <Text weight="medium">{card.front}</Text>
              <Text tone="muted">{card.back}</Text>
            </Stack>
          ))}
        </Stack>
      );
    case 'MATCHING':
      return (
        <Stack gap={1}>
          {content.data.pairs.map((pair, index) => (
            <Text key={`${pair.left}-${index}`}>
              {pair.left} — {pair.right}
            </Text>
          ))}
        </Stack>
      );
    case 'FILL_GAPS':
      return <Text preserveLines>{content.data.text}</Text>;
  }
}

export interface BlockContentProps {
  block: StudentBlockDetail;
  /** Обернуть содержимое в карточку (экран блока); по умолчанию — без обёртки. */
  card?: boolean;
}

/**
 * Содержимое блока курса глазами ученика. Правильных ответов здесь нет — сервер их вырезает,
 * так что вопросы теста показываются только как условие; отвечает ученик в форме сдачи.
 */
export function BlockContent({ block, card = false }: BlockContentProps) {
  const { t } = useTranslation('student');
  const body = (() => {
    switch (block.type) {
      case 'TEXT':
        return <TextBlock markdown={block.content.markdown} />;
      case 'VIDEO':
        return <VideoBlock content={block.content} />;
      case 'QUIZ':
        return (
          <Stack gap={2}>
            {block.content.questions.map((question, index) => (
              <Text key={question.id}>
                {index + 1}. {question.text}
              </Text>
            ))}
          </Stack>
        );
      case 'HOMEWORK':
      case 'PRACTICE':
        return <Text preserveLines>{block.content.instructions}</Text>;
      case 'QUESTION':
        return <Text preserveLines>{block.content.prompt}</Text>;
      case 'INTERACTIVE':
        return <InteractiveBlock content={block.content} />;
      default:
        return <Text tone="muted">{t('courses.contentNotSupported')}</Text>;
    }
  })();
  return card ? <Card>{body}</Card> : body;
}
