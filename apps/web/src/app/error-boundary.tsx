import { AppLayout, Button, ErrorState, Screen } from '@edu/ui';
import { Component, type ErrorInfo, type ReactNode } from 'react';
import { config } from '@/shared/config';
import { i18n } from '@/shared/i18n';
import { reportClientError } from './client-errors';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/**
 * Последний рубеж вне роутера (Splash, bootstrap, сам RouterProvider): необработанная ошибка
 * рендера → экран с перезагрузкой. Ошибки страниц ловит `errorElement` роутера (route-error.tsx).
 * Тексты — на языке момента падения (классовый компонент не подписан на смену языка).
 */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[app] необработанная ошибка', error, info.componentStack);
    reportClientError(config.apiUrl, 'render', error);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <AppLayout>
        <AppLayout.Content>
          <Screen>
            <ErrorState
              title={i18n.t('common:errors.crashTitle')}
              description={this.state.error.message}
              onRetry={() => window.location.reload()}
              retryLabel={i18n.t('common:errors.reload')}
            />
            <Button variant="ghost" onClick={() => this.setState({ error: null })}>
              {i18n.t('common:errors.tryContinue')}
            </Button>
          </Screen>
        </AppLayout.Content>
      </AppLayout>
    );
  }
}
