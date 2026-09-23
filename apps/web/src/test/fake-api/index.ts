/**
 * Контрактный фейковый сервер — только для тестов (`src/test`, msw/node). В приложении
 * моков нет: и dev, и production ходят в настоящий api (`VITE_API_URL`).
 * Демо-мир — те же фикстуры `@edu/contracts/fixtures`, что заполняют базу при `pnpm db:seed`.
 */
export { handlers } from './handlers';
export { db, resetMockDb } from './state';
