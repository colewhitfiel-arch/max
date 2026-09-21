import { Inline, Text } from '@edu/ui';
import type { ReactNode } from 'react';

/** Заголовок секции экрана с необязательным действием справа. */
export function SectionTitle({ children, action }: { children: ReactNode; action?: ReactNode }) {
  return (
    <Inline justify="between" align="center" wrap={false}>
      <Text variant="title" as="h2">
        {children}
      </Text>
      {action}
    </Inline>
  );
}
