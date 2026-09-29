import { demoUsers } from '@edu/contracts/fixtures';
import { describe, expect, it } from 'vitest';
import { i18n } from '@/shared/i18n';
import { DEMO_PERSONAS, DEMO_STEPS, firstStepOf } from './steps';

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
      if (!step.persona || !step.path || step.path === '/onboarding') continue;
      const role = DEMO_PERSONAS[step.persona].role as keyof typeof prefix;
      expect(step.path.startsWith(prefix[role]), step.id).toBe(true);
    }
  });

  it('разделы идут подряд: ученик → родитель → преподаватель', () => {
    expect(firstStepOf('student')).toBe(1);
    expect(firstStepOf('student')).toBeLessThan(firstStepOf('parent'));
    expect(firstStepOf('parent')).toBeLessThan(firstStepOf('teacher'));
    const sections = DEMO_STEPS.map((step) => step.section);
    const order = sections.filter((section, i) => section !== sections[i - 1]);
    expect(order).toEqual(['intro', 'student', 'parent', 'teacher', 'intro']);
  });
});
