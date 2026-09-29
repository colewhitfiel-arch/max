import { Injectable } from '@nestjs/common';
import type {
  ClubCard,
  ClubCategory,
  ClubDetail,
  ListClubsQuery,
  Paginated,
  TeacherPublicProfile,
} from '@edu/contracts';
import type { AuthUser } from '../../common/auth/auth-user';
import { Errors } from '../../common/errors/app-error';
import { normalizeLimit } from '../../common/pagination/cursor';
import { PrismaService } from '../../common/prisma/prisma.service';
import { IdentityService } from '../identity/identity.service';
import { SchoolService } from '../school/school.service';

const WEEKDAYS = ['Вс', 'Пн', 'Вт', 'Ср', 'Чт', 'Пт', 'Сб'];

const teacherBriefSelect = {
  select: {
    id: true,
    photoUrl: true,
    user: {
      select: { id: true, firstName: true, lastName: true, nickname: true, avatarUrl: true },
    },
  },
} as const;

interface TeacherBriefRow {
  id: string;
  photoUrl: string | null;
  user: {
    id: string;
    firstName: string;
    lastName: string | null;
    nickname: string | null;
    avatarUrl: string | null;
  };
}

const toTeacherBrief = (teacher: TeacherBriefRow) => ({
  id: teacher.id,
  user: teacher.user,
  photoUrl: teacher.photoUrl,
});

/**
 * Каталог кружков (docs/07 F4): список с фильтром по категории, карточка кружка с группами
 * и расписанием, публичный профиль преподавателя. Он же публичный сервис для рекомендаций
 * онбординга и траектории (docs/08 §8.3).
 */
@Injectable()
export class CatalogService {
  constructor(
    private readonly prisma: PrismaService,
    private readonly identity: IdentityService,
    private readonly school: SchoolService,
  ) {}

  // ---------- ручки каталога ----------

  /**
   * Кружки школы пользователя с фильтром по категории. Страница — по алфавиту, курсор не
   * нужен: кружков школы десятки, а не тысячи; `limit` из запроса всё равно уважается.
   */
  async listClubs(user: AuthUser, query: ListClubsQuery): Promise<Paginated<ClubCard>> {
    const schoolId = await this.identity.schoolIdOfUser(user);
    const cards = await this.listActiveClubCards(schoolId);
    const filtered = query.category
      ? cards.filter((card) => card.category === query.category)
      : cards;
    return { items: filtered.slice(0, normalizeLimit(query.limit)) };
  }

  async getClub(user: AuthUser, clubId: string): Promise<ClubDetail> {
    const schoolId = await this.identity.schoolIdOfUser(user);
    const club = await this.prisma.club.findFirst({
      where: { id: clubId, isActive: true, ...(schoolId ? { schoolId } : {}) },
      include: {
        groups: {
          where: { isActive: true },
          orderBy: { title: 'asc' },
          include: {
            scheduleRules: { where: { validTo: null }, orderBy: { weekday: 'asc' } },
            teacher: teacherBriefSelect,
          },
        },
      },
    });
    if (!club) throw Errors.notFound('Кружок');
    const [card] = this.toCards([club]);
    if (!card) throw Errors.notFound('Кружок');
    return {
      ...card,
      groups: club.groups.map((group) => ({
        id: group.id,
        title: group.title,
        teacher: toTeacherBrief(group.teacher),
        schedule: group.scheduleRules.map((rule) => ({
          id: rule.id,
          weekday: rule.weekday,
          startTime: rule.startTime,
          endTime: rule.endTime,
          room: rule.room,
        })),
      })),
    };
  }

  /** Контакты отдаются, только если их открыл и преподаватель, и политика школы. */
  async getTeacherPublicProfile(user: AuthUser, teacherId: string): Promise<TeacherPublicProfile> {
    const schoolId = await this.identity.schoolIdOfUser(user);
    const teacher = await this.prisma.teacherProfile.findFirst({
      where: { id: teacherId, ...(schoolId ? { schoolId } : {}) },
      select: {
        ...teacherBriefSelect.select,
        schoolId: true,
        qualification: true,
        bio: true,
        subjects: true,
        contactPhone: true,
        contactEmail: true,
        contactsVisible: true,
        groups: {
          where: { isActive: true },
          select: {
            club: { select: { id: true, title: true, category: true, coverUrl: true } },
          },
        },
      },
    });
    if (!teacher) throw Errors.notFound('Преподаватель');
    const settings = await this.school.getSettings(teacher.schoolId);
    const clubs = new Map(teacher.groups.map((group) => [group.club.id, group.club]));
    return {
      ...toTeacherBrief(teacher),
      qualification: teacher.qualification,
      bio: teacher.bio,
      subjects: teacher.subjects,
      clubs: [...clubs.values()].map((club) => ({
        id: club.id,
        title: club.title,
        category: club.category,
        coverUrl: club.coverUrl,
      })),
      contacts:
        settings.showTeacherContacts && teacher.contactsVisible
          ? { phone: teacher.contactPhone, email: teacher.contactEmail }
          : null,
    };
  }

  // ---------- публичный сервис ----------

  /**
   * Публичный сервис: новый кружок в каталоге школы — его создаёт модуль groups вместе с группой
   * преподавателя (docs/07 F19). Возвращает ClubBrief.
   */
  async createClub(input: {
    schoolId: string;
    title: string;
    description: string;
    category: ClubCategory;
    priceKopecks: number;
  }): Promise<{ id: string; title: string; category: ClubCategory; coverUrl: string | null }> {
    const club = await this.prisma.club.create({
      data: { ...input, tags: [] },
      select: { id: true, title: true, category: true, coverUrl: true },
    });
    return club;
  }

  /** Публичный сервис: карточки кружков по id (кружки ребёнка у родителя). */
  async clubCardsByIds(clubIds: string[]): Promise<Map<string, ClubCard>> {
    const unique = [...new Set(clubIds)];
    if (unique.length === 0) return new Map();
    const clubs = await this.prisma.club.findMany({
      where: { id: { in: unique } },
      include: {
        groups: {
          where: { isActive: true },
          include: {
            scheduleRules: { where: { validTo: null }, orderBy: { weekday: 'asc' } },
            teacher: teacherBriefSelect,
          },
        },
      },
    });
    return new Map(this.toCards(clubs).map((card) => [card.id, card]));
  }

  /** Активные кружки школы (без школы — все активные) в формате ClubCard. */
  async listActiveClubCards(schoolId: string | null): Promise<ClubCard[]> {
    const clubs = await this.prisma.club.findMany({
      where: { isActive: true, ...(schoolId ? { schoolId } : {}) },
      orderBy: { title: 'asc' },
      include: {
        groups: {
          where: { isActive: true },
          include: {
            scheduleRules: { where: { validTo: null }, orderBy: { weekday: 'asc' } },
            teacher: teacherBriefSelect,
          },
        },
      },
    });
    return this.toCards(clubs);
  }

  private toCards(
    clubs: Array<{
      id: string;
      title: string;
      category: string;
      coverUrl: string | null;
      description: string;
      priceKopecks: number;
      billingPeriod: ClubCard['billingPeriod'];
      tags: string[];
      groups: Array<{
        teacher: TeacherBriefRow;
        scheduleRules: Array<{ weekday: number; startTime: string; endTime: string }>;
      }>;
    }>,
  ): ClubCard[] {
    return clubs.map((club) => {
      const teachers = new Map<string, ClubCard['teachers'][number]>();
      const schedulePreview = new Set<string>(); // одинаковые слоты разных групп — один раз
      for (const group of club.groups) {
        teachers.set(group.teacher.id, toTeacherBrief(group.teacher));
        for (const rule of group.scheduleRules) {
          schedulePreview.add(`${WEEKDAYS[rule.weekday]} ${rule.startTime}–${rule.endTime}`);
        }
      }
      return {
        id: club.id,
        title: club.title,
        category: club.category as ClubCategory,
        coverUrl: club.coverUrl,
        description: club.description,
        price: { amountKopecks: club.priceKopecks, currency: 'RUB' as const },
        billingPeriod: club.billingPeriod,
        tags: club.tags,
        teachers: [...teachers.values()],
        schedulePreview: [...schedulePreview],
      };
    });
  }
}
