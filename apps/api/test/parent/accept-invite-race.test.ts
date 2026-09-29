/**
 * Гонка двойного нажатия «принять приглашение» (без БД, детерминированно): второй запрос прочитал
 * ссылку ещё непогашенной, а связь — уже созданной первым. Раньше он отвечал 409 «уже привязан»
 * (интеграционный тест child-invites ловил это лишь изредка).
 */
import { describe, expect, it, vi } from 'vitest';
import type { PrismaService } from '../../src/common/prisma/prisma.service';
import { FamilyService } from '../../src/modules/family/family.service';

const TOKEN = 'invite-token';
const PARENT = 'parent-1';

function serviceWith(state: { acceptedBy: string | null; linkActive: boolean }) {
  const invite = { parentId: PARENT, expiresAt: new Date(Date.now() + 60_000) };
  const tx = {
    parentInvite: {
      // Первое чтение — до коммита соседнего запроса (ссылка ещё не погашена), дальше — после.
      findUnique: vi
        .fn()
        .mockResolvedValueOnce({ ...invite, acceptedAt: null, acceptedBy: null })
        .mockResolvedValue({ ...invite, acceptedAt: new Date(), acceptedBy: state.acceptedBy }),
      updateMany: vi.fn().mockResolvedValue({ count: 0 }),
    },
    parentStudentLink: {
      findUnique: vi.fn().mockResolvedValue(state.linkActive ? { status: 'ACTIVE' } : null),
      upsert: vi.fn(),
    },
  };
  const prisma = {
    $transaction: (fn: (client: typeof tx) => Promise<unknown>) => fn(tx),
  } as unknown as PrismaService;
  return { service: new FamilyService(prisma), tx };
}

describe('FamilyService.acceptInvite — двойное нажатие', () => {
  it('соседний запрос того же ученика уже погасил ссылку и привязал — успех', async () => {
    const { service, tx } = serviceWith({ acceptedBy: 'student-1', linkActive: true });
    await expect(service.acceptInvite(TOKEN, 'student-1')).resolves.toEqual({ parentId: PARENT });
    expect(tx.parentStudentLink.upsert).not.toHaveBeenCalled();
  });

  it('ребёнок привязан раньше другим путём, а ссылка не погашена — по-прежнему 409', async () => {
    const { service } = serviceWith({ acceptedBy: null, linkActive: true });
    await expect(service.acceptInvite(TOKEN, 'student-1')).rejects.toMatchObject({
      code: 'CONFLICT',
    });
  });
});
