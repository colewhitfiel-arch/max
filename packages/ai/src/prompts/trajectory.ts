import { z } from 'zod';
import type { AiChatRequest } from '../types';
import type { MockResponseRule } from '../providers/mock';
import { definePrompt } from './registry';
import { parseClubsFromPrompt } from './onboarding';

/** Персональная образовательная траектория (F5): строится worker'ом по StudentContext. */

export const TrajectoryResultSchema = z.object({
  summary: z.string().min(1),
  strengths: z.array(z.string()).default([]),
  growthAreas: z.array(z.string()).default([]),
  recommendations: z
    .array(
      z.object({
        title: z.string().min(1),
        why: z.string().min(1),
        /** id кружка из списка (если рекомендация — записаться/продолжить в кружке). */
        clubId: z.string().optional(),
        /** id курса из списка (если рекомендация — пройти курс). */
        courseId: z.string().optional(),
      }),
    )
    .default([]),
  nextSteps: z.array(z.string()).default([]),
});
export type TrajectoryResult = z.infer<typeof TrajectoryResultSchema>;

export interface TrajectoryVars {
  /** Сериализованный StudentContext. */
  context: string;
  /** Кружки школы (`renderClubsForPrompt`); могут включать те, куда ученик уже ходит. */
  clubsText: string;
  /** Курсы ученика: `- id: <id> | <название> | прогресс N%`. */
  coursesText: string;
}

export const trajectoryPrompt = definePrompt({
  id: 'trajectory.build',
  version: 1,
  description: 'Построить персональную образовательную траекторию ученика по его данным',
  system: [
    'Ты — наставник по дополнительному образованию. По данным ученика (профиль, кружки, посещаемость,',
    'задания, результаты, прогресс по курсам) составь персональную образовательную траекторию на «ты», без воды.',
    'summary — 2–3 предложения о том, как идут дела и куда двигаться. strengths и growthAreas — по 2–4 коротких пункта,',
    'опирайся на факты из данных (проценты, сроки, темы). recommendations — 2–4 конкретных шага: следующий курс, кружок,',
    'проект или тема; если шаг связан с кружком или курсом из списков — укажи его clubId/courseId (только из списков).',
    'nextSteps — 2–4 действия на ближайшую неделю. Не выдумывай данных, которых нет.',
    'Отвечай строго JSON: {"summary","strengths":[],"growthAreas":[],"recommendations":[{"title","why","clubId?","courseId?"}],"nextSteps":[]}.',
  ].join(' '),
  user: (vars: TrajectoryVars) =>
    [
      'Данные ученика:',
      vars.context,
      '',
      'Кружки школы:',
      vars.clubsText || '(нет данных)',
      '',
      'Курсы ученика:',
      vars.coursesText || '(нет курсов)',
    ].join('\n'),
  schema: TrajectoryResultSchema,
  temperature: 0.4,
  maxTokens: 1200,
});

const byPrompt = (id: string) => (req: AiChatRequest) =>
  req.metadata?.promptId?.startsWith(`${id}@`) ?? false;

export const trajectoryMockRules: MockResponseRule[] = [
  {
    match: byPrompt(trajectoryPrompt.id),
    content: (req) => {
      const text = [...req.messages].reverse().find((m) => m.role === 'user')?.content ?? '';
      const clubs = parseClubsFromPrompt(text);
      const name = /Ученик: ([^,.]+)/.exec(text)?.[1]?.trim() ?? 'Ученик';
      const result: TrajectoryResult = {
        summary: `${name} стабильно ходит на занятия и делает первые проекты. Сильная сторона — практика, зона роста — регулярность домашних заданий.`,
        strengths: ['практические задачи', 'работа в проектах'],
        growthAreas: ['регулярность выполнения ДЗ', 'закрепление теории'],
        recommendations: clubs.slice(0, 2).map((club, index) => ({
          title: index === 0 ? `Продолжить «${club.title}»` : `Попробовать «${club.title}»`,
          why: index === 0 ? 'Здесь уже есть прогресс и интерес' : 'Развивает смежный навык',
          clubId: club.id,
        })),
        nextSteps: ['Сдать открытые задания до срока', 'Пройти следующий блок курса'],
      };
      return JSON.stringify(result);
    },
  },
];
