import { createHmac, timingSafeEqual } from 'node:crypto';

/**
 * Код занятия для QR-самоотметки: подписанный HMAC-SHA256 `(lessonId, expiresAt)` без хранения
 * на сервере. Бинарно — версия (1 байт) | lessonId (16) | срок, unix-секунды (4, BE) | подпись
 * (первые 16 байт HMAC), в base64url — 50 символов: влезает в `startapp` диплинка MAX.
 * Подделать код без ключа нельзя, продлить — тоже (срок под подписью).
 */
const VERSION = 1;
const LESSON_ID_BYTES = 16;
const PAYLOAD_BYTES = 1 + LESSON_ID_BYTES + 4;
const MAC_BYTES = 16;
const CODE_BYTES = PAYLOAD_BYTES + MAC_BYTES;
const UUID_RE = /^[0-9a-f]{8}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{4}-[0-9a-f]{12}$/i;
const BASE64URL_RE = /^[A-Za-z0-9_-]+$/;

export type CheckInCodeCheck =
  | { ok: true; lessonId: string; expiresAt: Date }
  | { ok: false; reason: 'CODE_INVALID' | 'CODE_EXPIRED' };

/**
 * Ключ подписи кодов, производный от секрета JWT: отдельная переменная окружения не нужна,
 * а подпись кода не совпадёт ни с одной подписью токенов (своя метка домена).
 */
export function deriveCheckInKey(secret: string): Buffer {
  return createHmac('sha256', secret).update('attendance-check-in/v1').digest();
}

function mac(key: Buffer, payload: Buffer): Buffer {
  return createHmac('sha256', key).update(payload).digest().subarray(0, MAC_BYTES);
}

/** Выдать код занятия, действующий до `expiresAt` (с точностью до секунды). */
export function signCheckInCode(key: Buffer, lessonId: string, expiresAt: Date): string {
  if (!UUID_RE.test(lessonId)) throw new Error('signCheckInCode: lessonId — не UUID');
  const payload = Buffer.alloc(PAYLOAD_BYTES);
  payload.writeUInt8(VERSION, 0);
  Buffer.from(lessonId.replace(/-/g, ''), 'hex').copy(payload, 1);
  payload.writeUInt32BE(Math.floor(expiresAt.getTime() / 1000), 1 + LESSON_ID_BYTES);
  return Buffer.concat([payload, mac(key, payload)]).toString('base64url');
}

/** Проверить код: подпись, версия, срок. Срок проверяется только у подлинного кода. */
export function verifyCheckInCode(key: Buffer, code: string, now: Date): CheckInCodeCheck {
  if (!BASE64URL_RE.test(code)) return { ok: false, reason: 'CODE_INVALID' };
  const raw = Buffer.from(code, 'base64url');
  if (raw.length !== CODE_BYTES) return { ok: false, reason: 'CODE_INVALID' };
  const payload = raw.subarray(0, PAYLOAD_BYTES);
  if (!timingSafeEqual(raw.subarray(PAYLOAD_BYTES), mac(key, payload)))
    return { ok: false, reason: 'CODE_INVALID' };
  if (payload.readUInt8(0) !== VERSION) return { ok: false, reason: 'CODE_INVALID' };
  const hex = payload.subarray(1, 1 + LESSON_ID_BYTES).toString('hex');
  const lessonId = `${hex.slice(0, 8)}-${hex.slice(8, 12)}-${hex.slice(12, 16)}-${hex.slice(16, 20)}-${hex.slice(20)}`;
  const expiresAt = new Date(payload.readUInt32BE(1 + LESSON_ID_BYTES) * 1000);
  if (expiresAt.getTime() <= now.getTime()) return { ok: false, reason: 'CODE_EXPIRED' };
  return { ok: true, lessonId, expiresAt };
}
