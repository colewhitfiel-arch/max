import '@edu/ui/styles.css';
import { AppLayout, ErrorState, Screen } from '@edu/ui';
import { StrictMode } from 'react';
import { createRoot } from 'react-dom/client';
import { config } from '@/shared/config';
import { i18n } from '@/shared/i18n';
import { createMaxBridge, type MaxBridge } from '@/shared/max';
import { App } from './App';
import { Providers } from './providers';

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
