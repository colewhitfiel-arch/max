/**
 * Seed демо-мира из packages/contracts/src/fixtures. Идемпотентен (upsert по id).
 * Запуск: `pnpm db:seed` (корень) или `prisma db seed` из packages/db.
 * Модульные фрагменты — в этой папке по файлам; index.ts (владелец db) вызывает их по порядку.
 */
import { createPrismaClient } from '../client';
import { seedIdentity } from './identity';
import { seedCatalogAndGroups } from './catalog-groups';
import { seedLearning } from './learning';
import { seedAiPaymentsNotifications } from './ai-payments-notifications';

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  const now = new Date();
  try {
    console.log('seed: identity (школа, пользователи, профили, связи)');
    await seedIdentity(prisma);
    console.log('seed: catalog + groups (кружки, группы, зачисления, расписание, занятия)');
    await seedCatalogAndGroups(prisma, now);
    console.log('seed: learning (посещаемость, курс, блоки, задания, сдачи, прогресс)');
    await seedLearning(prisma, now);
    console.log('seed: ai + payments + notifications');
    await seedAiPaymentsNotifications(prisma, now);
    console.log('seed: готово');
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('seed: ошибка', error);
  process.exit(1);
});
