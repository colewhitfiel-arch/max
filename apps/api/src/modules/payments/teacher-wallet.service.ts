import { Inject, Injectable } from '@nestjs/common';
import type {
  BalancePoint,
  TeacherDebt,
  TeacherWallet,
  TeacherWalletPeriod,
  TeacherWalletQuery,
  TeacherWalletTransaction,
  TeacherWithdrawal,
  WithdrawTeacherWalletBody,
} from '@edu/contracts';
import type { AuthUser } from '../../common/auth/auth-user';
import { Errors } from '../../common/errors/app-error';
import { KV_STORE, type KeyValueStore } from '../../common/kv/key-value-store';
import { AppLogger } from '../../common/logger/logger.service';
import { GroupsService } from '../groups/groups.service';
import { IdentityService } from '../identity/identity.service';
import { PaymentsRepository } from './payments.repository';
import { PaymentsService } from './payments.service';

const DAY_MS = 86_400_000;
const HOUR_MS = 3_600_000;
/** Сколько помнить результат вывода по `Idempotency-Key`. */
const WITHDRAW_REPLAY_TTL_SEC = 24 * 60 * 60;
/** Ближайший платёж дальше этого срока в «Вам должны» не показывается (docs/04 payments). */
const DEBT_HORIZON_DAYS = 45;

/** Окно периода и сетка точек графика (docs/04 payments). */
const WINDOW: Record<TeacherWalletPeriod, { ms: number; points: number; stepMs: number }> = {
  day: { ms: DAY_MS, points: 7, stepMs: 4 * HOUR_MS },
  week: { ms: 7 * DAY_MS, points: 8, stepMs: DAY_MS },
  month: { ms: 30 * DAY_MS, points: 31, stepMs: DAY_MS },
};

const toDateOnly = (date: Date) => date.toISOString().slice(0, 10);

/**
 * Кошелёк преподавателя (docs/07 F17): баланс, график изменения, операции за период и
 * «Вам должны». Поступления создаёт `PaymentsService` при оплате, вывод — списание здесь.
 */
@Injectable()
export class TeacherWalletService {
  private readonly log;

  constructor(
    private readonly repo: PaymentsRepository,
    private readonly payments: PaymentsService,
    private readonly groups: GroupsService,
    private readonly identity: IdentityService,
    @Inject(KV_STORE) private readonly kv: KeyValueStore,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'payments' });
  }

  async getWallet(user: AuthUser, query: TeacherWalletQuery): Promise<TeacherWallet> {
    const teacherId = requireTeacher(user);
    const to = new Date();
    const window = WINDOW[query.period];
    const from = new Date(to.getTime() - window.ms);
    const [rows, balance, debts] = await Promise.all([
      this.repo.listTeacherTransactions(teacherId),
      this.repo.teacherBalance(teacherId),
      this.debts(teacherId),
    ]);
    const inPeriod = rows.filter((row) => row.at.getTime() >= from.getTime());
    return {
      balance: { amountKopecks: Math.max(0, balance), currency: 'RUB' },
      period: query.period,
      from: from.toISOString(),
      to: to.toISOString(),
      history: this.history(rows, balance, from, to, window),
      transactions: await this.toTransactions(inPeriod),
      debts,
    };
  }

  /**
   * Вывод средств — заглушка до выплат через провайдера (docs/07 F17): сумма списывается
   * сразу. `Idempotency-Key` защищает от двойного списания при повторе запроса.
   */
  async withdraw(
    user: AuthUser,
    body: WithdrawTeacherWalletBody,
    idempotencyKey: string,
  ): Promise<TeacherWithdrawal> {
    const teacherId = requireTeacher(user);
    const key = `wallet:withdraw:${teacherId}:${idempotencyKey}`;
    const replay = await this.kv.get<TeacherWithdrawal>(key);
    if (replay) return replay;

    const balance = await this.repo.teacherBalance(teacherId);
    if (body.amountKopecks > balance)
      throw Errors.businessRule('Сумма вывода больше баланса', { balanceKopecks: balance });
    const created = await this.repo.createWithdrawal(
      teacherId,
      body.amountKopecks,
      'RUB',
      new Date(),
    );
    const result: TeacherWithdrawal = {
      balance: { amountKopecks: balance - body.amountKopecks, currency: 'RUB' },
      transaction: {
        id: created.id,
        kind: 'WITHDRAWAL',
        amount: { amountKopecks: body.amountKopecks, currency: 'RUB' },
        at: created.at.toISOString(),
        group: null,
        student: null,
      },
    };
    await this.kv.set(key, result, WITHDRAW_REPLAY_TTL_SEC);
    this.log.info({ teacherId, amountKopecks: body.amountKopecks }, 'вывод с кошелька');
    return result;
  }

  // ---------- внутреннее ----------

  /** Баланс в равноотстоящих точках окна: первая — на `from`, последняя — текущая. */
  private history(
    rows: Array<{ kind: 'INCOME' | 'WITHDRAWAL'; amountKopecks: number; at: Date }>,
    balanceNow: number,
    from: Date,
    to: Date,
    window: { points: number; stepMs: number },
  ): BalancePoint[] {
    const points = Array.from({ length: window.points }, (_, index) => {
      const at = new Date(to.getTime() - (window.points - 1 - index) * window.stepMs);
      return at.getTime() < from.getTime() ? from : at;
    });
    return points.map((at) => {
      // Баланс на момент = текущий минус всё, что произошло после этого момента.
      const after = rows
        .filter((row) => row.at.getTime() > at.getTime())
        .reduce((sum, row) => sum + (row.kind === 'INCOME' ? 1 : -1) * row.amountKopecks, 0);
      return {
        at: at.toISOString(),
        balance: { amountKopecks: Math.max(0, balanceNow - after), currency: 'RUB' as const },
      };
    });
  }

  private async toTransactions(
    rows: Array<{
      id: string;
      kind: 'INCOME' | 'WITHDRAWAL';
      amountKopecks: number;
      groupId: string | null;
      studentId: string | null;
      at: Date;
    }>,
  ): Promise<TeacherWalletTransaction[]> {
    const [groups, students] = await Promise.all([
      this.groups.groupBriefsByIds(rows.flatMap((row) => (row.groupId ? [row.groupId] : []))),
      this.identity.studentBriefsByIds(
        rows.flatMap((row) => (row.studentId ? [row.studentId] : [])),
      ),
    ]);
    return rows.map((row) => ({
      id: row.id,
      kind: row.kind,
      amount: { amountKopecks: row.amountKopecks, currency: 'RUB' as const },
      at: row.at.toISOString(),
      group: (row.groupId ? (groups.get(row.groupId) ?? null) : null),
      student: (row.studentId ? (students.get(row.studentId) ?? null) : null),
    }));
  }

  /** «Вам должны»: зачисления групп преподавателя с просроченным или близким платежом. */
  private async debts(teacherId: string): Promise<TeacherDebt[]> {
    const enrollments = await this.groups.listEnrollmentsOfTeacher(teacherId);
    if (enrollments.length === 0) return [];
    const [periods, students] = await Promise.all([
      this.payments.periodsOf(enrollments),
      this.identity.studentBriefsByIds(enrollments.map((item) => item.studentId)),
    ]);
    const byEnrollment = new Map(periods.map((period) => [period.enrollmentId, period]));
    const horizon = toDateOnly(new Date(Date.now() + DEBT_HORIZON_DAYS * DAY_MS));
    return enrollments
      .flatMap((enrollment) => {
        const period = byEnrollment.get(enrollment.id);
        const student = students.get(enrollment.studentId);
        if (!period || !student || period.nextPaymentAt > horizon) return [];
        return [
          {
            id: enrollment.id,
            group: enrollment.group,
            student,
            amount: { amountKopecks: enrollment.priceKopecks, currency: 'RUB' as const },
            dueAt: period.nextPaymentAt,
          },
        ];
      })
      .sort((a, b) => a.dueAt.localeCompare(b.dueAt));
  }
}

function requireTeacher(user: AuthUser): string {
  if (user.activeRole !== 'TEACHER' || !user.profileId)
    throw Errors.forbidden('Только для преподавателя');
  return user.profileId;
}
