import { describe, expect, it } from 'vitest';
import {
  attendanceCheckInStartParam,
  parseAttendanceCheckInStartParam,
  parseAttendanceQrValue,
} from './attendance';

const CODE = 'AZBqTbcf5nKsHPAz1xYxXw4Uq0x1sQ6yRcEjJ9mO2vT-UQwe_Q';

describe('код занятия из QR', () => {
  it('диплинк MAX: startapp=checkin_<код>', () => {
    const url = `https://max.ru/se14447967_bot?startapp=${attendanceCheckInStartParam(CODE)}`;
    expect(parseAttendanceQrValue(url)).toBe(CODE);
    expect(parseAttendanceQrValue(`  ${url}\n`)).toBe(CODE);
    expect(parseAttendanceQrValue(`https://max.ru/bot?x=1&startapp=checkin_${CODE}#top`)).toBe(
      CODE,
    );
  });

  it('веб-адрес без имени бота: /check-in/<код>', () => {
    expect(parseAttendanceQrValue(`https://max-edu.vercel.app/check-in/${CODE}`)).toBe(CODE);
    expect(parseAttendanceQrValue(`http://localhost:5173/check-in/${CODE}/?utm=1`)).toBe(CODE);
  });

  it('голая полезная нагрузка диплинка', () => {
    expect(parseAttendanceQrValue(`checkin_${CODE}`)).toBe(CODE);
    expect(parseAttendanceCheckInStartParam(`checkin_${CODE}`)).toBe(CODE);
  });

  it('чужие QR и мусор → null', () => {
    expect(parseAttendanceQrValue(null)).toBeNull();
    expect(parseAttendanceQrValue('')).toBeNull();
    expect(parseAttendanceQrValue(CODE)).toBeNull();
    expect(parseAttendanceQrValue('https://example.com/pay?sum=100')).toBeNull();
    expect(parseAttendanceQrValue(`https://max.ru/bot?startapp=invite_${CODE}`)).toBeNull();
    expect(parseAttendanceQrValue('https://max.ru/bot?startapp=checkin_short')).toBeNull();
    expect(parseAttendanceQrValue(`https://site.ru/check-in/${CODE}!`)).toBeNull();
    expect(parseAttendanceCheckInStartParam('demo')).toBeNull();
  });
});
