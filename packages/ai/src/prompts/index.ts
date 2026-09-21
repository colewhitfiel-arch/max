/**
 * Продуктовые промпты (workstreams C и G). Ключ `id@version` пишется в результаты генерации,
 * поэтому любое изменение текста промпта — новая версия.
 */
import type { MockResponseRule } from '../providers/mock';
import { courseBuilderMockRules } from './course-builder';
import { onboardingMockRules } from './onboarding';
import { PromptRegistry, type AnyPrompt } from './registry';
import { tutorMockRules } from './tutor';
import { trajectoryMockRules } from './trajectory';
import { lessonPrompt, surveyPrompt, topicMaterialPrompt } from './course-builder';
import { onboardingTurnPrompt, recommendClubsPrompt } from './onboarding';
import { tutorPrompt } from './tutor';
import { trajectoryPrompt } from './trajectory';

export * from './registry';
export * from './course-builder';
export * from './tutor';
export * from './onboarding';
export * from './trajectory';

export const productPrompts: AnyPrompt[] = [
  topicMaterialPrompt,
  surveyPrompt,
  lessonPrompt,
  tutorPrompt,
  onboardingTurnPrompt,
  recommendClubsPrompt,
  trajectoryPrompt,
];

export function createProductRegistry(): PromptRegistry {
  return new PromptRegistry().registerAll(productPrompts);
}

/** Детерминированные ответы mock-провайдера для всех продуктовых промптов (dev без сети, тесты). */
export const productMockRules: MockResponseRule[] = [
  ...courseBuilderMockRules,
  ...tutorMockRules,
  ...onboardingMockRules,
  ...trajectoryMockRules,
];
