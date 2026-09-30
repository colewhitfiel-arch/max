import { parseAttendanceCheckInStartParam } from '@edu/contracts';

/**
 * Экран отметки для полезной нагрузки диплинка MAX (`startapp=checkin_<код>` →
 * `/check-in/<код>`): QR занятия, отсканированный обычной камерой телефона. null — это не
 * отметка или код битый.
 */
export function checkInPathFromStartParam(startParam: string | null | undefined): string | null {
  const code = parseAttendanceCheckInStartParam(startParam);
  return code ? `/check-in/${code}` : null;
}
