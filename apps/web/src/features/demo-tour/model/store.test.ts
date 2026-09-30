import { afterEach, describe, expect, it } from 'vitest';
import { DEMO_STEPS } from './steps';
import { startDemoTour, useDemoTourStore } from './store';

const saved = () => sessionStorage.getItem('demo-tour');

describe('состояние демонстрационного режима', () => {
  afterEach(() => useDemoTourStore.getState().stop());

  it('start/go/stop и копия в sessionStorage (перезагрузка продолжает тур)', () => {
    startDemoTour();
    expect(useDemoTourStore.getState()).toMatchObject({ active: true, index: 0 });
    expect(JSON.parse(saved()!)).toEqual({ active: true, index: 0, context: {} });

    useDemoTourStore.getState().go(5);
    expect(useDemoTourStore.getState().index).toBe(5);
    expect(JSON.parse(saved()!)).toEqual({ active: true, index: 5, context: {} });

    useDemoTourStore.getState().stop();
    expect(useDemoTourStore.getState()).toMatchObject({ active: false, index: 0 });
    expect(saved()).toBeNull();
  });

  it('контекст прогона сохраняется между шагами, новый запуск начинает с пустого', () => {
    startDemoTour();
    useDemoTourStore.getState().setContext({ jobId: 'job-1' });
    useDemoTourStore.getState().go(3);
    useDemoTourStore.getState().setContext({ courseId: 'course-1' });
    expect(useDemoTourStore.getState().context).toEqual({ jobId: 'job-1', courseId: 'course-1' });
    expect(JSON.parse(saved()!).context).toEqual({ jobId: 'job-1', courseId: 'course-1' });

    startDemoTour();
    expect(useDemoTourStore.getState().context).toEqual({});
  });

  it('шаг за пределами сценария заканчивает тур; start ограничивает индекс', () => {
    startDemoTour(DEMO_STEPS.length - 1);
    useDemoTourStore.getState().go(DEMO_STEPS.length);
    expect(useDemoTourStore.getState().active).toBe(false);

    startDemoTour(999);
    expect(useDemoTourStore.getState().index).toBe(DEMO_STEPS.length - 1);
    useDemoTourStore.getState().go(-1);
    expect(useDemoTourStore.getState().active).toBe(false);
  });
});
