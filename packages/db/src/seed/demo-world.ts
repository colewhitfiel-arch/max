import type { PrismaClient } from '../../generated/client';
import { seedAiPaymentsNotifications } from './ai-payments-notifications';
import { seedCatalogAndGroups } from './catalog-groups';
import { seedIdentity } from './identity';
import { seedLearning } from './learning';

/**
 * Весь демо-мир по порядку фрагментов. Идемпотентен: повторный вызов возвращает демо-данные
 * к фикстурам, даты — относительно `now`. Вызывается из `seed/index.ts` и тестов seed'а.
 */
export async function seedDemoWorld(
  prisma: PrismaClient,
  now: Date = new Date(),
  log: (message: string) => void = () => undefined,
): Promise<void> {
  log('seed: identity (школа, пользователи, профили, связи)');
  await seedIdentity(prisma);
  log('seed: catalog + groups (кружки, группы, зачисления, расписание, занятия)');
  await seedCatalogAndGroups(prisma, now);
  log('seed: learning (посещаемость, курс, блоки, задания, сдачи, прогресс)');
  await seedLearning(prisma, now);
  log('seed: ai + payments + notifications');
  await seedAiPaymentsNotifications(prisma, now);
  log('seed: готово');
}
