import { randomBytes, scrypt, timingSafeEqual } from 'node:crypto';

/**
 * Хэш пароля — scrypt из node:crypto (без нативных зависимостей). Формат строки:
 * `scrypt$<N>$<r>$<p>$<salt base64url>$<hash base64url>` — параметры хранятся рядом с хэшем,
 * поэтому их можно усилить позже, не ломая старые записи.
 */
const N = 16384;
const R = 8;
const P = 1;
const KEY_LENGTH = 64;
const SALT_BYTES = 16;

function derive(password: string, salt: Buffer, n: number, r: number, p: number): Promise<Buffer> {
  return new Promise((resolve, reject) => {
    scrypt(
      password.normalize('NFKC'),
      salt,
      KEY_LENGTH,
      { N: n, r, p, maxmem: 64 * 1024 * 1024 },
      (error, key) => (error ? reject(error) : resolve(key)),
    );
  });
}

export async function hashPassword(password: string): Promise<string> {
  const salt = randomBytes(SALT_BYTES);
  const key = await derive(password, salt, N, R, P);
  return ['scrypt', N, R, P, salt.toString('base64url'), key.toString('base64url')].join('$');
}

/** Проверка за постоянное время; испорченная строка хэша — просто «не совпало». */
export async function verifyPassword(password: string, stored: string): Promise<boolean> {
  const [scheme, n, r, p, salt, hash] = stored.split('$');
  if (scheme !== 'scrypt' || !n || !r || !p || !salt || !hash) return false;
  const expected = Buffer.from(hash, 'base64url');
  if (expected.length !== KEY_LENGTH) return false;
  const actual = await derive(password, Buffer.from(salt, 'base64url'), +n, +r, +p);
  return timingSafeEqual(actual, expected);
}

/**
 * Хэш для несуществующего логина: проверка по нему занимает столько же времени, сколько
 * настоящая, — по задержке ответа не понять, есть ли такой логин.
 */
export const DUMMY_PASSWORD_HASH = [
  'scrypt',
  N,
  R,
  P,
  Buffer.alloc(SALT_BYTES).toString('base64url'),
  Buffer.alloc(KEY_LENGTH).toString('base64url'),
].join('$');
