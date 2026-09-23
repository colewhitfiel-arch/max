import { ToastProvider } from '@edu/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { I18nextProvider, useTranslation } from 'react-i18next';
import { queryClient } from '@/shared/api/query-client';
import { i18n } from '@/shared/i18n';
import { type MaxBridge, MaxBridgeProvider } from '@/shared/max';
import { ErrorBoundary } from './error-boundary';

export interface ProvidersProps {
  bridge: MaxBridge;
  children: ReactNode;
}

/** Тосты с подписями региона и крестика на языке интерфейса. */
function LocalizedToastProvider({ children }: { children: ReactNode }) {
  const { t } = useTranslation('common');
  return (
    <ToastProvider regionLabel={t('notifications')} closeLabel={t('actions.close')}>
      {children}
    </ToastProvider>
  );
}

/** MaxBridge → QueryClient → i18n → Toast → ErrorBoundary. */
export function Providers({ bridge, children }: ProvidersProps) {
  return (
    <MaxBridgeProvider bridge={bridge}>
      <QueryClientProvider client={queryClient}>
        <I18nextProvider i18n={i18n}>
          <LocalizedToastProvider>
            <ErrorBoundary>{children}</ErrorBoundary>
          </LocalizedToastProvider>
        </I18nextProvider>
      </QueryClientProvider>
    </MaxBridgeProvider>
  );
}
