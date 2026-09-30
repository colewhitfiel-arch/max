import { describe, expect, it } from 'vitest';
import { serverlessStorageDriver, withServerlessDbParams } from '../../src/vercel';

describe('withServerlessDbParams (Vercel + Neon)', () => {
  it('добавляет connect_timeout, pool_timeout и connection_limit к строке подключения', () => {
    const url = withServerlessDbParams(
      'postgresql://u:p@host-pooler.neon.tech/edu?sslmode=require',
    );
    const params = new URL(url).searchParams;
    expect(params.get('sslmode')).toBe('require');
    expect(params.get('connect_timeout')).toBe('15');
    expect(params.get('pool_timeout')).toBe('15');
    expect(params.get('connection_limit')).toBe('5');
  });

  it('уже заданные параметры не перезаписывает', () => {
    const url = withServerlessDbParams(
      'postgresql://u:p@h/edu?connect_timeout=30&connection_limit=1',
    );
    const params = new URL(url).searchParams;
    expect(params.get('connect_timeout')).toBe('30');
    expect(params.get('connection_limit')).toBe('1');
    expect(params.get('pool_timeout')).toBe('15');
  });

  it('некорректную строку возвращает как есть', () => {
    expect(withServerlessDbParams('not a url')).toBe('not a url');
  });
});

describe('serverlessStorageDriver (Vercel)', () => {
  it('без S3 файлы хранятся в Postgres: общего диска у инстансов нет', () => {
    expect(serverlessStorageDriver(undefined)).toBe('postgres');
    expect(serverlessStorageDriver('local')).toBe('postgres');
    expect(serverlessStorageDriver('postgres')).toBe('postgres');
  });

  it('заданный S3 не подменяется', () => {
    expect(serverlessStorageDriver('s3')).toBe('s3');
  });
});
