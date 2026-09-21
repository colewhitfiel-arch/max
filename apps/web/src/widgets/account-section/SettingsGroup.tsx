import { Stack, Text } from '@edu/ui';
import type { ReactNode } from 'react';

/** Группа настроек: заголовок как у карточек главной («Посещения») + содержимое. */
export function SettingsGroup({ title, children }: { title: ReactNode; children: ReactNode }) {
  return (
    <Stack gap={2}>
      <Text as="h2" variant="body" weight="bold">
        {title}
      </Text>
      {children}
    </Stack>
  );
}
