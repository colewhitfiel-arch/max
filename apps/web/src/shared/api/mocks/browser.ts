import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';
import { enableMockPersistence } from './state';

// Ad-hoc пользователи dev-входа переживают reload (refresh-токен моста лежит в localStorage).
enableMockPersistence();

/** MSW-воркер для `VITE_API_MODE=mock`; стартует в `app/main.tsx` до рендера. */
export const worker = setupWorker(...handlers);
