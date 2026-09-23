/**
 * Продуктовые промпты (workstreams C и G). Ключ `id@version` пишется в результаты генерации,
 * поэтому любое изменение текста промпта — новая версия.
 */
import type { MockResponseRule } from '../providers/mock';
import {
  courseBuilderMockRules,
  lessonPrompt,
  surveyPrompt,
  topicMaterialPrompt,
} from './course-builder';
import { onboardingMockRules, onboardingTurnPrompt, recommendClubsPrompt } from './onboarding';
import { parentTutorMockRules, parentTutorPrompt } from './parent-tutor';
import { PromptRegistry, type AnyPrompt } from './registry';
import { trajectoryMockRules, trajectoryPrompt } from './trajectory';
import { tutorMockRules, tutorPrompt } from './tutor';

export * from './registry';
export * from './course-builder';
export * from './tutor';
export * from './parent-tutor';
export * from './onboarding';
export * from './trajectory';

export const productPrompts: AnyPrompt[] = [
  topicMaterialPrompt,
  surveyPrompt,
  lessonPrompt,
  tutorPrompt,
  parentTutorPrompt,
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
  ...parentTutorMockRules,
  ...onboardingMockRules,
  ...trajectoryMockRules,
];
