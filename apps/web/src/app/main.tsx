import '@edu/ui/styles.css';
import { AppLayout, ErrorState, Screen } from '@edu/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { config } from '@/shared/config';
import { i18n } from '@/shared/i18n';
import { createMaxBridge, type MaxBridge } from '@/shared/max';
import { App } from './App';
import { Providers } from './providers';

async function startMocks(): Promise<void> {
  const { worker } = await import('@/shared/api/mocks/browser');
  await worker.start({
    onUnhandledRequest: 'bypass',
    serviceWorker: { url: `${import.meta.env.BASE_URL}mockServiceWorker.js` },
  });
}

function renderFatal(root: ReturnType<typeof createRoot>, error: unknown) {
  const message = error instanceof Error ? error.message : String(error);
  root.render(
    <AppLayout>
      <AppLayout.Content>
        <Screen>
          <ErrorState title={i18n.t('common:errors.bootTitle')} description={message} />
        </Screen>
      </AppLayout.Content>
    </AppLayout>,
  );
}

async function bootstrap(): Promise<void> {
  const container = document.getElementById('root');
  if (!container) throw new Error('Нет элемента #root');
  const root = createRoot(container);

  if (config.apiMode === 'mock') {
    try {
      await startMocks();
    } catch (error) {
      // Без Service Worker mock-режим не работает (нет public/mockServiceWorker.js или SW запрещён).
      console.error('[msw] не удалось запустить мок-воркер', error);
      renderFatal(
        root,
        new Error(
          'MSW не запустился: проверь, что есть public/mockServiceWorker.js (`pnpm exec msw init public`) ' +
            'и что браузер разрешает Service Worker. Либо переключи VITE_API_MODE=real.',
        ),
      );
      return;
    }
  }

  let bridge: MaxBridge;
  try {
    bridge = createMaxBridge(config.maxMode);
    await bridge.init();
  } catch (error) {
    console.error('[max-bridge] init failed', error);
    renderFatal(root, error);
    return;
  }

  root.render(
    <StrictMode>
      <Providers bridge={bridge}>
        <App />
      </Providers>
    </StrictMode>,
  );
}

void bootstrap();
