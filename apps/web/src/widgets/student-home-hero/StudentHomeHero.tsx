import { Stack } from '@edu/ui';
import mascot from './assets/mascot.png';

/** Иллюстрация-маскот главной ученика (декоративная, из макета). */
export function StudentHomeHero() {
  return (
    <Stack align="center">
      <img src={mascot} alt="" width={182} height={259} decoding="async" />
    </Stack>
  );
}
