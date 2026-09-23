import { z } from 'zod';
import type { AiChatRequest } from '../types';
import type { MockResponseRule } from '../providers/mock';
import { oneLine, safeName } from './data-fence';
import { definePrompt } from './registry';

/**
 * Онбординг (F1): диалог 5–8 реплик, по итогам — профиль ученика и подбор кружков.
 * Ответ модели — JSON с репликой: реплику сервер стримит клиенту токенами, флаг завершения и
 * черновик профиля уходят в событие `done`.
 */

export const OnboardingProfileSchema = z.object({
  interests: z.array(z.string()),
  goals: z.array(z.string()),
  weeklyHours: z.number().int().nonnegative(),
  preferredFormats: z.array(z.string()),
  summary: z.string(),
  /** Что хотел бы попробовать позже, а не сейчас — направления/кружки «на будущее». */
  futureInterests: z.array(z.string()).default([]),
});
export type OnboardingProfile = z.infer<typeof OnboardingProfileSchema>;

export const OnboardingTurnSchema = z.object({
  reply: z.string().min(1),
  isComplete: z.boolean(),
  profileDraft: OnboardingProfileSchema.nullable().default(null),
});
export type OnboardingTurn = z.infer<typeof OnboardingTurnSchema>;

export interface OnboardingVars {
  studentName: string;
  /** Категории/названия кружков школы — чтобы вопросы были про то, что реально есть. */
  clubsSummary: string;
  /** Сколько ответов ученик уже дал. */
  answered: number;
}

export const ONBOARDING_MIN_ANSWERS = 4;
export const ONBOARDING_MAX_ANSWERS = 7;
const MAX_CLUBS_SUMMARY_LENGTH = 500;

export const onboardingTurnPrompt = definePrompt({
  id: 'onboarding.turn',
  version: 3,
  description: 'Реплика онбординга: следующий вопрос или завершение с черновиком профиля',
  system: (vars: OnboardingVars) =>
    [
      // Имя (ник задаёт сам ученик) и список кружков — одной строкой: перевод строки не допишет «правил».
      `Ты — дружелюбный ИИ-тьютор, знакомишься с учеником по имени ${safeName(vars.studentName, 'друг')} (школьник).`,
      'Цель — за 4–7 коротких вопросов узнать: чем интересуется, какие предметы нравятся, какие навыки хочет развить,',
      'какие цели, сколько часов в неделю готов заниматься, какие форматы подходят (практика, проекты, теория, игры, команда/один).',
      'Обязательно один из вопросов — про будущее: что хотел бы попробовать ПОЗЖЕ (через полгода-год), но не сейчас —',
      'потому что нет времени, страшно, «сначала подрасту» или просто любопытно. Это отдельно от того, куда идёт сейчас.',
      'Задавай по ОДНОМУ вопросу за раз, коротко, на «ты», с опорой на предыдущие ответы. Не перечисляй все вопросы сразу.',
      `В школе есть кружки: ${oneLine(vars.clubsSummary, MAX_CLUBS_SUMMARY_LENGTH) || 'разные направления'}.`,
      `Ученик уже ответил на ${vars.answered} вопрос(ов). Минимум ${ONBOARDING_MIN_ANSWERS} ответа, максимум ${ONBOARDING_MAX_ANSWERS}.`,
      'Как только известны интересы, цели, время в неделю и «на потом» — СРАЗУ завершай, не задавай уточняющих и',
      'проверочных вопросов (не проси назвать проекты, жанры, элементы игры и т. п.).',
      'Когда информации достаточно (или достигнут максимум) — заверши: короткая благодарность + скажи, что сейчас подберёшь кружки,',
      'и заполни profileDraft: interests (3–6 слов/фраз), goals, weeklyHours (целое число, 0 если не сказал), preferredFormats,',
      'futureInterests (направления «на потом», 0–4 фразы; пусто, если ученик ничего такого не назвал), summary (2 предложения о ученике).',
      'Отвечай строго JSON: {"reply": string, "isComplete": boolean, "profileDraft": {...} | null}. Пока не завершено — profileDraft: null.',
    ].join('\n'),
  schema: OnboardingTurnSchema,
  temperature: 0.7,
  maxTokens: 600,
});

/** Первое сообщение онбординга (без вызова модели). */
export const ONBOARDING_OPENING =
  'Привет! Я Сайд, твой ИИ-тьютор. Давай познакомимся, чтобы подобрать тебе кружки. Расскажи, чем тебе нравится заниматься в свободное время?';

// ---------- Подбор кружков ----------

export const ClubRecommendationsSchema = z.object({
  items: z
    .array(
      z.object({
        clubId: z.string().min(1),
        reason: z.string().min(1),
        score: z.number().min(0).max(1),
      }),
    )
    .default([]),
});
export type ClubRecommendations = z.infer<typeof ClubRecommendationsSchema>;

export interface RecommendClubsVars {
  profileText: string;
  /** Список кружков `- id: <id> | <название> | <категория> | <описание> | теги` (см. `renderClubsForPrompt`). */
  clubsText: string;
  /** Сколько кружков вернуть. */
  limit: number;
}

export const recommendClubsPrompt = definePrompt({
  id: 'onboarding.recommend-clubs',
  version: 1,
  description: 'Ранжировать каталог кружков школы под профиль ученика',
  system: [
    'Ты подбираешь кружки дополнительного образования для школьника по его профилю.',
    'Из списка кружков выбери самые подходящие, для каждого объясни причину одним предложением на «ты»',
    '(свяжи с интересами, целями, форматом или нагрузкой ученика) и оцени релевантность от 0 до 1.',
    'Используй только id из списка. Отвечай строго JSON: {"items": [{"clubId": string, "reason": string, "score": number}]}.',
  ].join(' '),
  user: (vars: RecommendClubsVars) =>
    [
      `Профиль ученика:\n${vars.profileText}`,
      '',
      `Кружки (верни не больше ${vars.limit}, отсортируй по score):`,
      vars.clubsText,
    ].join('\n'),
  schema: ClubRecommendationsSchema,
  temperature: 0.3,
  maxTokens: 900,
});

export interface PromptClub {
  id: string;
  title: string;
  category: string;
  description: string;
  tags: string[];
}

/** Поле строки кружка: без переводов строк и `|` — иначе ломается формат `- id: … | … |` и его разбор. */
const clubField = (value: string) => value.replace(/[\s|]+/g, ' ').trim();

export function renderClubsForPrompt(clubs: PromptClub[]): string {
  return clubs
    .map(
      (club) =>
        `- id: ${clubField(club.id)} | ${clubField(club.title)} | ${clubField(club.category)} | ${clubField(club.description)} | ${club.tags.map(clubField).join(', ')}`,
    )
    .join('\n');
}

const CLUB_LINE = /^- id: (\S+) \| ([^|]+) \|/;

export function parseClubsFromPrompt(text: string): Array<{ id: string; title: string }> {
  const clubs: Array<{ id: string; title: string }> = [];
  for (const line of text.split('\n')) {
    const match = CLUB_LINE.exec(line.trim());
    if (match) clubs.push({ id: match[1] ?? '', title: (match[2] ?? '').trim() });
  }
  return clubs;
}

// ---------- Mock ----------

const byPrompt = (id: string) => (req: AiChatRequest) =>
  req.metadata?.promptId?.startsWith(`${id}@`) ?? false;

/**
 * Вопросы mock-онбординга после приветствия (оно спрашивает об интересах): цели → часы/формат →
 * «на потом». Порядок совпадает с web-моком; `ONBOARDING_OPENING` + вопросы = ONBOARDING_MIN_ANSWERS ответов.
 */
const MOCK_QUESTIONS = [
  'Здорово! А какие цели ты бы хотел достичь за этот год?',
  'Понял. Сколько часов в неделю ты готов уделять кружкам и как тебе больше нравится заниматься — практика, проекты, теория?',
  'И последнее: есть что-то, что хочется попробовать не сейчас, а попозже — через полгода-год?',
];

export const onboardingMockRules: MockResponseRule[] = [
  {
    match: byPrompt(onboardingTurnPrompt.id),
    content: (req) => {
      const answers = req.messages.filter((m) => m.role === 'user');
      const answered = answers.length;
      // Ответ i (с 1) — на приветствие (i = 1) или на MOCK_QUESTIONS[i - 2]; пока вопросы есть — задаём следующий.
      if (answered <= MOCK_QUESTIONS.length) {
        const turn: OnboardingTurn = {
          reply: MOCK_QUESTIONS[Math.max(answered - 1, 0)] ?? MOCK_QUESTIONS[0]!,
          isComplete: false,
          profileDraft: null,
        };
        return JSON.stringify(turn);
      }
      const futureAnswer = answers[answers.length - 1]?.content.trim();
      const words = answers
        .flatMap((m) => m.content.split(/[\s,.;!?]+/))
        .map((w) => w.toLowerCase())
        .filter((w) => w.length > 3)
        .slice(0, 5);
      const turn: OnboardingTurn = {
        reply: 'Спасибо! Я понял твои интересы. Сейчас подберу кружки, которые тебе подойдут.',
        isComplete: true,
        profileDraft: {
          interests: words.length > 0 ? words : ['роботы', 'программирование'],
          goals: ['научиться новому и сделать свой проект'],
          weeklyHours: 4,
          preferredFormats: ['практика', 'проекты'],
          // Последний ответ — на вопрос «на потом» (он задаётся последним).
          futureInterests: futureAnswer ? [futureAnswer.slice(0, 60)] : [],
          summary: `Ученик рассказал о себе: ${answers[0]?.content.slice(0, 80) ?? ''}. Любит практику и проекты.`,
        },
      };
      return JSON.stringify(turn);
    },
  },
  {
    match: byPrompt(recommendClubsPrompt.id),
    content: (req) => {
      const text = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      const clubs = parseClubsFromPrompt(text);
      const result: ClubRecommendations = {
        items: clubs.slice(0, 5).map((club, index) => ({
          clubId: club.id,
          reason:
            index === 0
              ? `«${club.title}» совпадает с твоими интересами и даёт много практики`
              : `«${club.title}» поможет достичь цели и подходит по формату`,
          score: Math.max(0.5, 0.92 - index * 0.11),
        })),
      };
      return JSON.stringify(result);
    },
  },
];
