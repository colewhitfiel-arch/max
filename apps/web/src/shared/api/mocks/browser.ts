import { setupWorker } from 'msw/browser';
import { handlers } from './handlers';

/** MSW-воркер для `VITE_API_MODE=mock`; стартует в `app/main.tsx` до рендера. */
export const worker = setupWorker(...handlers);
