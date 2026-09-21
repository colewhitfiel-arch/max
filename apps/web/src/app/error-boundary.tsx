import { AppLayout, Button, ErrorState, Screen } from '@edu/ui';
import { Component, type ErrorInfo, type ReactNode } from 'react';

interface Props {
  children: ReactNode;
}

interface State {
  error: Error | null;
}

/** Последний рубеж: необработанная ошибка рендера → экран с перезагрузкой. */
export class ErrorBoundary extends Component<Props, State> {
  override state: State = { error: null };

  static getDerivedStateFromError(error: Error): State {
    return { error };
  }

  override componentDidCatch(error: Error, info: ErrorInfo): void {
    console.error('[app] необработанная ошибка', error, info.componentStack);
  }

  override render(): ReactNode {
    if (!this.state.error) return this.props.children;
    return (
      <AppLayout>
        <AppLayout.Content>
          <Screen>
            <ErrorState
              title="Что-то сломалось"
              description={this.state.error.message}
              onRetry={() => window.location.reload()}
              retryLabel="Перезагрузить"
            />
            <Button variant="ghost" onClick={() => this.setState({ error: null })}>
              Попробовать продолжить
            </Button>
          </Screen>
        </AppLayout.Content>
      </AppLayout>
    );
  }
}
