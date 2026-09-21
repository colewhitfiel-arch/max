import { ToastProvider } from '@edu/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import type { ReactNode } from 'react';
import { I18nextProvider } from 'react-i18next';
import { queryClient } from '@/shared/api/query-client';
import { i18n } from '@/shared/i18n';
import { type MaxBridge, MaxBridgeProvider } from '@/shared/max';
import { ErrorBoundary } from './error-boundary';

export interface ProvidersProps {
  bridge: MaxBridge;
  children: ReactNode;
}

/** MaxBridge → QueryClient → Toast → i18n → ErrorBoundary. */
export function Providers({ bridge, children }: ProvidersProps) {
  return (
    <MaxBridgeProvider bridge={bridge}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <I18nextProvider i18n={i18n}>
            <ErrorBoundary>{children}</ErrorBoundary>
          </I18nextProvider>
        </ToastProvider>
      </QueryClientProvider>
    </MaxBridgeProvider>
  );
}
