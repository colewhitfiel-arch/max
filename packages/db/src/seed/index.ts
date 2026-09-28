/**
 * Seed демо-мира из packages/contracts/src/fixtures. Идемпотентен (upsert по id).
 * Запуск: `pnpm db:seed` (корень) или `prisma db seed` из packages/db.
 * Модульные фрагменты — в этой папке по файлам; demo-world.ts (владелец db) вызывает их по порядку.
 */
import { createPrismaClient } from '../client';
import { seedDemoWorld } from './demo-world';

async function main(): Promise<void> {
  const prisma = createPrismaClient();
  try {
    await seedDemoWorld(prisma, new Date(), (message) => console.log(message));
  } finally {
    await prisma.$disconnect();
  }
}

main().catch((error) => {
  console.error('seed: ошибка', error);
  process.exit(1);
});
