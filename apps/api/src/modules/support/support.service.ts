import { Injectable } from '@nestjs/common';
import type { CreateTicketBody, CreateTicketResult, SupportTicketsList } from '@edu/contracts';
import type { AuthUser } from '../../common/auth/auth-user';
import { AppLogger } from '../../common/logger/logger.service';
import { PrismaService } from '../../common/prisma/prisma.service';

/** Сколько обращений показывать в списке: их у пользователя единицы. */
const LIST_LIMIT = 50;

/**
 * Обращения в поддержку (docs/07): пользователь создаёт тикет и видит свои.
 * Таблица support_tickets — только этот модуль (AGENT_GUIDE §4).
 */
@Injectable()
export class SupportService {
  private readonly log;

  constructor(
    private readonly prisma: PrismaService,
    logger: AppLogger,
  ) {
    this.log = logger.child({ module: 'support' });
  }

  async create(user: AuthUser, body: CreateTicketBody): Promise<CreateTicketResult> {
    const ticket = await this.prisma.supportTicket.create({
      data: {
        userId: user.userId,
        subject: body.subject.trim(),
        message: body.message.trim(),
      },
      select: { id: true },
    });
    // Текст обращения в лог не пишем — это переписка пользователя.
    this.log.info({ ticketId: ticket.id }, 'обращение в поддержку создано');
    return { id: ticket.id };
  }

  async list(user: AuthUser): Promise<SupportTicketsList> {
    const rows = await this.prisma.supportTicket.findMany({
      where: { userId: user.userId },
      orderBy: { createdAt: 'desc' },
      take: LIST_LIMIT,
      select: { id: true, subject: true, status: true, createdAt: true },
    });
    return {
      items: rows.map((row) => ({
        id: row.id,
        subject: row.subject,
        status: row.status,
        createdAt: row.createdAt.toISOString(),
      })),
    };
  }
}
