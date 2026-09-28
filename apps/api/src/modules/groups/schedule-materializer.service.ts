import { Injectable } from '@nestjs/common';
import { AppLogger } from '../../common/logger/logger.service';
import { PrismaService } from '../../common/prisma/prisma.service';
import { toDateOnly, tzOffsetMinutes } from '../../common/time/time';
import { IdentityService } from '../identity/identity.service';
import { SchoolService } from '../school/school.service';

/** На сколько недель вперёд держим занятия из правил расписания (docs/04, groups + schedule). */
export const MATERIALIZE_WEEKS = 8;
const DEFAULT_TIMEZONE = 'Europe/Moscow';
const MINUTE_MS = 60_000;
const DAY_MS = 24 * 60 * MINUTE_MS;

/** Правило расписания в том виде, в каком его разворачивает материализация. */
export interface RuleForSlots {
  id: string;
  groupId: string;
  /** 0 — воскресенье … 6 — суббота (по часам школы). */
  weekday: number;
  startTime: string;
  endTime: string;
  room: string | null;
  /** Даты `@db.Date` — полночь UTC нужного дня. */
  validFrom: Date;
  validTo: Date | null;
}

export interface LessonSlot {
  groupId: string;
  ruleId: string;
  startsAt: Date;
  endsAt: Date;
  room: string | null;
}

const parseTime = (time: string): [number, number] | null => {
  const match = /^(\d{2}):(\d{2})$/.exec(time);
  if (!match) return null;
  const [h, m] = [Number(match[1]), Number(match[2])];
  return h < 24 && m < 60 ? [h, m] : null;
};

/**
 * Момент, когда на часах пояса `timezone` будет `date` (`YYYY-MM-DD`, полночь UTC) + `h:m`.
 * Смещение берём в самом моменте: сначала приблизительно, затем уточняем — так переход на
 * летнее время не сдвигает занятие на час.
 */
function wallClockToUtc(timezone: string, date: Date, [h, m]: [number, number]): Date {
  const wall = date.getTime() + (h * 60 + m) * MINUTE_MS;
  const guess = wall - tzOffsetMinutes(timezone, new Date(wall)) * MINUTE_MS;
  return new Date(wall - tzOffsetMinutes(timezone, new Date(guess)) * MINUTE_MS);
}

/**
 * Слоты правила на `weeks` недель вперёд, начиная с сегодняшнего дня по часам школы
 * (сегодняшний слот входит, даже если уже начался). Учитываются `validFrom`/`validTo`
 * (обе даты включительно); правило, у которого конец не позже начала, слотов не даёт.
 */
export function ruleSlots(
  rule: RuleForSlots,
  timezone: string,
  now: Date,
  weeks = MATERIALIZE_WEEKS,
): LessonSlot[] {
  const start = parseTime(rule.startTime);
  const end = parseTime(rule.endTime);
  if (!start || !end || end[0] * 60 + end[1] <= start[0] * 60 + start[1]) return [];
  const today = new Date(`${toDateOnly(timezone, now)}T00:00:00.000Z`);
  const slots: LessonSlot[] = [];
  for (let day = 0; day < weeks * 7; day += 1) {
    const date = new Date(today.getTime() + day * DAY_MS);
    if (date.getUTCDay() !== rule.weekday) continue;
    if (date.getTime() < rule.validFrom.getTime()) continue;
    if (rule.validTo && date.getTime() > rule.validTo.getTime()) continue;
    slots.push({
      groupId: rule.groupId,
      ruleId: rule.id,
      startsAt: wallClockToUtc(timezone, date, start),
      endsAt: wallClockToUtc(timezone, date, end),
      room: rule.room,
    });
  }
  return slots;
}

const overlaps = (a: { startsAt: Date; endsAt: Date }, b: { startsAt: Date; endsAt: Date }) =>
  a.startsAt.getTime() < b.endsAt.getTime() && b.startsAt.getTime() < a.endsAt.getTime();

/**
 * Материализация расписания (job `schedule.materialize`, docs/04): правила активных групп
 * превращаются в занятия на 8 недель вперёд по часам школы. Идемпотентна: занятие из правила
 * уникально по `(ruleId, startsAt)`, повторный запуск ничего не дублирует, а отменённое
 * занятие не воскрешает. Слот пропускается, если в группе уже есть неотменённое занятие,
 * пересекающееся с ним (например, разовое): занятия одной группы не пересекаются (§4.5 п. 9).
 * Пояс школы — через школу преподавателя группы (identity + school), чужие таблицы не читаются.
 */
@Injectable()
export class ScheduleMaterializerService {
  private readonly log;

  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
    private readonly school: SchoolService,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'schedule' });
  }

  async materialize(now: Date = new Date()): Promise<{ created: number }> {
    const rules = await this.prisma.scheduleRule.findMany({
      where: { group: { isActive: true } },
      select: {
        id: true,
        groupId: true,
        weekday: true,
        startTime: true,
        endTime: true,
        room: true,
        validFrom: true,
        validTo: true,
        group: { select: { teacherId: true } },
      },
    });
    const timezones = await this.timezonesOfTeachers(rules.map((rule) => rule.group.teacherId));

    const slots: LessonSlot[] = [];
    for (const rule of rules) {
      const timezone = timezones.get(rule.group.teacherId);
      if (timezone) slots.push(...ruleSlots(rule, timezone, now));
    }
    if (slots.length === 0) return { created: 0 };

    const from = new Date(Math.min(...slots.map((slot) => slot.startsAt.getTime())));
    const to = new Date(Math.max(...slots.map((slot) => slot.endsAt.getTime())));
    const existing = await this.prisma.lesson.findMany({
      where: {
        groupId: { in: [...new Set(slots.map((slot) => slot.groupId))] },
        status: { not: 'CANCELLED' },
        startsAt: { lt: to },
        endsAt: { gt: from },
      },
      select: { groupId: true, startsAt: true, endsAt: true },
    });
    const busy = new Map<string, Array<{ startsAt: Date; endsAt: Date }>>();
    for (const lesson of existing) {
      busy.set(lesson.groupId, [...(busy.get(lesson.groupId) ?? []), lesson]);
    }

    const data: LessonSlot[] = [];
    for (const slot of slots.sort((a, b) => a.startsAt.getTime() - b.startsAt.getTime())) {
      const taken = busy.get(slot.groupId) ?? [];
      if (taken.some((lesson) => overlaps(lesson, slot))) continue;
      taken.push(slot);
      busy.set(slot.groupId, taken);
      data.push(slot);
    }
    if (data.length === 0) return { created: 0 };
    // Отменённое занятие из правила остаётся в таблице: skipDuplicates не даёт создать его снова.
    const { count } = await this.prisma.lesson.createMany({ data, skipDuplicates: true });
    this.log.info({ rules: rules.length, created: count }, 'расписание материализовано');
    return { created: count };
  }

  /** Пояс школы преподавателя; школа с невалидным поясом пропускается (занятия не угадываем). */
  private async timezonesOfTeachers(teacherIds: string[]): Promise<Map<string, string>> {
    const result = new Map<string, string>();
    for (const teacherId of new Set(teacherIds)) {
      const schoolId = await this.identity.getTeacherSchoolId(teacherId);
      const timezone = schoolId ? await this.school.timezone(schoolId) : DEFAULT_TIMEZONE;
      try {
        tzOffsetMinutes(timezone);
        result.set(teacherId, timezone);
      } catch {
        this.log.warn({ teacherId, schoolId }, 'пояс школы невалиден — правила пропущены');
      }
    }
    return result;
  }
}
