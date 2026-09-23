import { Injectable } from '@nestjs/common';
import type {
  AcceptParentInviteResult,
  ChildClub,
  ChildClubsList,
  ChildrenList,
  LinkChildBody,
  LinkChildResult,
  ParentInvite,
  ChildInvite,
} from '@edu/contracts';
import type { AuthUser } from '../../common/auth/auth-user';
import { Errors } from '../../common/errors/app-error';
import { DomainEventBus } from '../../common/events/domain-events';
import { AppLogger } from '../../common/logger/logger.service';
import { type Env } from '../../config/env';
import { InjectEnv } from '../../config/env.module';
import { StudentDashboardService } from '../analytics/student-dashboard.service';
import { CatalogService } from '../catalog/catalog.service';
import { FamilyService } from '../family/family.service';
import { GroupsService } from '../groups/groups.service';
import { IdentityService } from '../identity/identity.service';
import { PaymentsService } from '../payments/payments.service';
import { SchoolService } from '../school/school.service';

/**
 * Дети родителя (docs/07 F14): список, привязка по коду и по ссылке, отвязка и кружки
 * ребёнка с расписанием, прогрессом и оплатой. Свои таблицы у модуля не заведены —
 * всё через публичные сервисы family, identity, groups, catalog, payments и analytics.
 */
@Injectable()
export class ChildrenService {
  private readonly log;

  constructor(
    private readonly family: FamilyService,
    private readonly identity: IdentityService,
    private readonly school: SchoolService,
    private readonly groups: GroupsService,
    private readonly catalog: CatalogService,
    private readonly payments: PaymentsService,
    private readonly dashboards: StudentDashboardService,
    private readonly events: DomainEventBus,
    @InjectEnv() private readonly env: Env,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'family' });
  }

  async listChildren(user: AuthUser): Promise<ChildrenList> {
    const parentId = requireParent(user);
    const links = await this.family.listLinks(parentId);
    const students = await this.identity.studentBriefsByIds(links.map((link) => link.studentId));
    const items = await Promise.all(
      links.map(async (link) => {
        const student = students.get(link.studentId);
        if (!student) return null;
        const profile = await this.identity.getStudentProfile(link.studentId);
        return {
          student,
          linkStatus: link.status,
          school: profile?.schoolId ? await this.school.getBrief(profile.schoolId) : null,
        };
      }),
    );
    return { items: items.filter((item) => item !== null) };
  }

  async linkChild(user: AuthUser, body: LinkChildBody): Promise<LinkChildResult> {
    const parentId = requireParent(user);
    const studentId = await this.identity.findStudentIdByLinkCode(body.code);
    if (!studentId) throw Errors.notFound('Ученик с таким кодом');
    const linkStatus = await this.family.link(parentId, studentId, 'ACTIVE');
    const students = await this.identity.studentBriefsByIds([studentId]);
    const student = students.get(studentId);
    if (!student) throw Errors.notFound('Ученик');
    this.log.info({ parentId, studentId }, 'ребёнок привязан по коду');
    return { student, linkStatus };
  }

  async createInvite(user: AuthUser): Promise<ChildInvite> {
    const parentId = requireParent(user);
    const invite = await this.family.createInvite(parentId);
    return {
      token: invite.token,
      // Deep link MAX появится вместе с production-интеграцией (workstream J).
      url: `${this.env.WEB_URL}/invite/${invite.token}`,
      expiresAt: invite.expiresAt.toISOString(),
    };
  }

  async unlinkChild(user: AuthUser, studentId: string): Promise<void> {
    const parentId = requireParent(user);
    await this.family.unlink(parentId, studentId);
    this.log.info({ parentId, studentId }, 'ребёнок отвязан');
  }

  async getInvite(user: AuthUser, token: string): Promise<ParentInvite> {
    requireStudent(user);
    const invite = await this.family.findInvite(token);
    if (!invite) throw Errors.notFound('Приглашение');
    const parent = await this.identity.parentUserBrief(invite.parentId);
    if (!parent) throw Errors.notFound('Приглашение');
    return {
      token: invite.token,
      parent,
      expiresAt: invite.expiresAt.toISOString(),
      status: invite.acceptedAt
        ? 'ACCEPTED'
        : invite.expiresAt.getTime() < Date.now()
          ? 'EXPIRED'
          : 'PENDING',
    };
  }

  async acceptInvite(user: AuthUser, token: string): Promise<AcceptParentInviteResult> {
    const studentId = requireStudent(user);
    const { parentId } = await this.family.acceptInvite(token, studentId);
    const parent = await this.identity.parentUserBrief(parentId);
    if (!parent) throw Errors.notFound('Приглашение');
    this.log.info({ parentId, studentId }, 'приглашение родителя принято');
    return { parent, linkStatus: 'ACTIVE' };
  }

  async listChildClubs(user: AuthUser, studentId: string): Promise<ChildClubsList> {
    const parentId = requireParent(user);
    await this.family.assertParentLinked(parentId, studentId);
    const enrollments = await this.groups.listEnrollmentsForBilling(studentId);
    if (enrollments.length === 0) return { items: [] };
    const studentUserId = await this.identity.userIdOfProfile('STUDENT', studentId);
    const [cards, periods, progress] = await Promise.all([
      this.catalog.clubCardsByIds(enrollments.map((item) => item.clubId)),
      this.payments.periodsOf(enrollments),
      this.dashboards.clubProgressOf(studentId, studentUserId ?? ''),
    ]);
    const periodByEnrollment = new Map(periods.map((period) => [period.enrollmentId, period]));
    const progressByGroup = new Map(progress.map((item) => [item.group.id, item]));
    const items = enrollments.flatMap<ChildClub>((enrollment) => {
      const club = cards.get(enrollment.clubId);
      const period = periodByEnrollment.get(enrollment.id);
      const clubProgress = progressByGroup.get(enrollment.groupId);
      if (!club || !period || !clubProgress) return [];
      return [
        {
          club,
          group: enrollment.group,
          enrollmentId: enrollment.id,
          schedule: enrollment.schedule,
          progress: clubProgress,
          paidUntil: period.paidUntil,
          nextPaymentAt: period.nextPaymentAt,
          price: period.price,
        },
      ];
    });
    return { items };
  }
}

function requireParent(user: AuthUser): string {
  if (user.activeRole !== 'PARENT' || !user.profileId) throw Errors.forbidden('Только для родителя');
  return user.profileId;
}

function requireStudent(user: AuthUser): string {
  if (user.activeRole !== 'STUDENT' || !user.profileId) throw Errors.forbidden('Только для ученика');
  return user.profileId;
}
