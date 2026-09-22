import { describe, expect, it } from 'vitest';
import { Semaphore } from './semaphore';

describe('Semaphore', () => {
  it('пускает не больше limit одновременно, остальные ждут в порядке очереди', async () => {
    const sem = new Semaphore(1);
    const order: string[] = [];
    const releaseA = await sem.acquire();
    const b = sem.acquire().then((release) => {
      order.push('b');
      return release;
    });
    const c = sem.acquire().then((release) => {
      order.push('c');
      return release;
    });
    expect(sem.inFlight).toBe(1);
    expect(sem.waiting).toBe(2);
    releaseA();
    releaseA(); // повторный вызов — no-op
    (await b)();
    (await c)();
    expect(order).toEqual(['b', 'c']);
    expect(sem.inFlight).toBe(0);
  });

  it('отмена в очереди отклоняет ожидание и не занимает слот', async () => {
    const sem = new Semaphore(1);
    const release = await sem.acquire();
    const ctrl = new AbortController();
    const waiting = sem.acquire(ctrl.signal);
    ctrl.abort(new Error('stop'));
    await expect(waiting).rejects.toThrow('stop');
    expect(sem.waiting).toBe(0);
    release();
    expect(sem.inFlight).toBe(0);
  });

  it('уже отменённый сигнал — сразу reject', async () => {
    const sem = new Semaphore(2);
    const ctrl = new AbortController();
    ctrl.abort();
    await expect(sem.acquire(ctrl.signal)).rejects.toBeInstanceOf(DOMException);
  });
});
