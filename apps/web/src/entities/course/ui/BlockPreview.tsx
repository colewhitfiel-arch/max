import type { CourseBlock, CourseDraftBlock } from '@edu/contracts';
import { CheckIcon, Divider, Inline, Markdown, Stack, Text } from '@edu/ui';
import { useTranslation } from 'react-i18next';

export interface BlockPreviewProps {
  /** Блок черновика генерации или курса — содержимое целиком, с ответами. */
  block: CourseDraftBlock | CourseBlock;
}

/**
 * Содержимое блока глазами преподавателя: теория, вопросы теста с отмеченными верными ответами
 * и пояснениями, эталон вопроса, карточки, пары и пропуски с ответами. Только чтение — ревью
 * черновика перед публикацией и просмотр опубликованного курса.
 */
export function BlockPreview({ block }: BlockPreviewProps) {
  const { t } = useTranslation('teacher');
  switch (block.type) {
    case 'TEXT':
      return <Markdown source={block.content.markdown} />;
    case 'VIDEO':
      return <Text tone="muted">{block.content.url ?? t('coursePreview.videoFile')}</Text>;
    case 'QUIZ':
      return (
        <Stack gap={3}>
          {block.content.questions.map((question, index) => (
            <Stack key={question.id} gap={1}>
              {index > 0 && <Divider />}
              <Text weight="medium">
                {index + 1}. {question.text}
              </Text>
              {question.options.map((option) =>
                question.correctOptionIds.includes(option.id) ? (
                  <Inline key={option.id} gap={1} align="start" wrap={false}>
                    <CheckIcon size={16} />
                    <Text variant="small" tone="success" weight="medium">
                      {option.text}
                    </Text>
                  </Inline>
                ) : (
                  <Text key={option.id} variant="small" tone="muted">
                    {option.text}
                  </Text>
                ),
              )}
              {question.explanation && (
                <Text variant="caption" tone="muted">
                  {t('coursePreview.explanation')}: {question.explanation}
                </Text>
              )}
            </Stack>
          ))}
          <Text variant="caption" tone="muted">
            {t('coursePreview.passScore', { value: block.content.passScore })}
          </Text>
        </Stack>
      );
    case 'QUESTION':
      return (
        <Stack gap={2}>
          <Text preserveLines>{block.content.prompt}</Text>
          {block.content.expectedAnswer && (
            <Text variant="small" tone="muted" preserveLines>
              {t('coursePreview.expectedAnswer')}: {block.content.expectedAnswer}
            </Text>
          )}
          {block.content.rubric && (
            <Text variant="small" tone="muted" preserveLines>
              {t('coursePreview.rubric')}: {block.content.rubric}
            </Text>
          )}
        </Stack>
      );
    case 'PRACTICE':
    case 'HOMEWORK':
      return (
        <Stack gap={2}>
          <Text preserveLines>{block.content.instructions}</Text>
          <Text variant="caption" tone="muted">
            {t(`coursePreview.submission.${block.content.submissionType}`)}
          </Text>
        </Stack>
      );
    case 'INTERACTIVE': {
      const { content } = block;
      if (content.kind === 'FLASHCARDS')
        return (
          <Stack gap={2}>
            {content.data.cards.map((card, index) => (
              <Stack key={`${card.front}-${index}`} gap={0}>
                {index > 0 && <Divider />}
                <Text weight="medium">{card.front}</Text>
                <Text variant="small" tone="muted">
                  {card.back}
                </Text>
              </Stack>
            ))}
          </Stack>
        );
      if (content.kind === 'MATCHING')
        return (
          <Stack gap={1}>
            {content.data.pairs.map((pair, index) => (
              <Text key={`${pair.left}-${index}`} variant="small">
                {pair.left} — {pair.right}
              </Text>
            ))}
          </Stack>
        );
      return (
        <Text preserveLines>
          {content.data.text.replace(
            /\{\{([^}]+)\}\}/g,
            (_, answer: string) => `«${answer.trim()}»`,
          )}
        </Text>
      );
    }
    default:
      return <Text tone="muted">{t('coursePreview.notSupported')}</Text>;
  }
}
