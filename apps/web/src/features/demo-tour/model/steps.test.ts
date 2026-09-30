import { demoUsers } from '@edu/contracts/fixtures';
import { describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { DEMO_PERSONAS, DEMO_STEPS, firstStepOf, stepPath } from './steps';

/** Контекст прогона, в котором раздел «Конспект → курс» уже всё создал. */
const CONTEXT = { jobId: 'job', courseId: 'course', lessonId: 'lesson', quizId: 'quiz' };

describe('сценарий демонстрационного режима', () => {
  it('id шагов уникальны; первый — приветствие, последний — итог', () => {
    const ids = DEMO_STEPS.map((step) => step.id);
    expect(new Set(ids).size).toBe(ids.length);
    expect(ids[0]).toBe('welcome');
    expect(ids.at(-1)).toBe('finish');
  });

  it('у каждого шага есть заголовок и текст на ru и en', () => {
    for (const lng of ['ru', 'en']) {
      for (const step of DEMO_STEPS) {
        for (const part of ['title', 'text']) {
          const key = `demo:steps.${step.id}.${part}`;
          expect(i18n.exists(key, { lng }), `${lng}: ${key}`).toBe(true);
        }
      }
      // Итог в браузере: «Готово» ведёт на экран входа, а не к выбору роли.
      expect(i18n.exists('demo:steps.finish.textLogin', { lng })).toBe(true);
    }
  });

  it('демо-пользователи входят только в свои роли (на стенде с MAX иначе 403)', () => {
    const users = Object.values(demoUsers);
    for (const persona of Object.values(DEMO_PERSONAS)) {
      const user = users.find((u) => u.maxUserId === persona.maxUserId);
      expect(user?.id).toBe(persona.userId);
      expect(user?.roles).toContain(persona.role);
    }
  });

  it('экраны шагов — в разделе роли демо-пользователя', () => {
    const prefix = { STUDENT: '/student', PARENT: '/parent', TEACHER: '/teacher' } as const;
    for (const step of DEMO_STEPS) {
      const path = stepPath(step, CONTEXT);
      if (!step.persona || !path || path === '/onboarding') continue;
      const role = DEMO_PERSONAS[step.persona].role as keyof typeof prefix;
      expect(path.startsWith(prefix[role]), step.id).toBe(true);
    }
  });

  it('экраны созданного в прогоне появляются только после действий, которые их создают', () => {
    const dynamic = DEMO_STEPS.filter((step) => typeof step.path === 'function');
    for (const step of dynamic) expect(stepPath(step, {}), step.id).toBeUndefined();
    const generate = DEMO_STEPS.findIndex((step) => step.action === 'generateCourse');
    const publish = DEMO_STEPS.findIndex((step) => step.action === 'publishCourse');
    expect(generate).toBeGreaterThan(0);
    expect(publish).toBeGreaterThan(generate);
    expect(DEMO_STEPS.findIndex((step) => step.waitFor === 'draftReady')).toBe(generate + 1);
  });

  it('разделы идут подряд: конспект → курс, ученик, родитель, преподаватель', () => {
    expect(firstStepOf('course')).toBe(1);
    expect(firstStepOf('course')).toBeLessThan(firstStepOf('student'));
    expect(firstStepOf('student')).toBeLessThan(firstStepOf('parent'));
    expect(firstStepOf('parent')).toBeLessThan(firstStepOf('teacher'));
    const sections = DEMO_STEPS.map((step) => step.section);
    const order = sections.filter((section, i) => section !== sections[i - 1]);
    expect(order).toEqual(['intro', 'course', 'student', 'parent', 'teacher', 'intro']);
  });
});
