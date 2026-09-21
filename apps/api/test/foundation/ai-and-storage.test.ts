import { mkdtempSync, rmSync } from 'node:fs';
import { tmpdir } from 'node:os';
import path from 'node:path';
import pino from 'pino';
import { afterAll, describe, expect, it } from 'vitest';
import { buildAiService } from '../../src/modules/ai/ai.factory';
import { LocalFsStorage } from '../../src/modules/files/storage/local-fs.storage';
import { buildStorageKey } from '../../src/modules/files/storage/storage-provider';
import { testEnv } from '../helpers/env';

const silent = pino({ level: 'silent' });

describe('AiService (mock provider)', () => {
  it('отвечает детерминированно и стримит токены', async () => {
    const ai = buildAiService(testEnv({ AI_PROVIDER: 'mock' }), silent);
    const res = await ai.chat({ messages: [{ role: 'user', content: 'Привет' }] });
    expect(res.content).toContain('Привет');
    const chunks: string[] = [];
    for await (const chunk of ai.stream({ messages: [{ role: 'user', content: 'раз два три' }] })) {
      if (chunk.type === 'token') chunks.push(chunk.text);
    }
    expect(chunks.join('')).toContain('раз');
  });

  it('gigachat без ключа не создаётся', () => {
    expect(() => testEnv({ AI_PROVIDER: 'gigachat' })).toThrow(/GIGACHAT_AUTH_KEY/);
  });
});

describe('LocalFsStorage', () => {
  const root = mkdtempSync(path.join(tmpdir(), 'edu-storage-'));
  const storage = new LocalFsStorage({
    rootDir: root,
    apiUrl: 'http://localhost:3000',
    secret: 'x'.repeat(32),
  });
  afterAll(() => rmSync(root, { recursive: true, force: true }));

  it('пишет, читает, проверяет наличие и удаляет', async () => {
    const key = buildStorageKey('MATERIAL', 'file-1', 'методичка.pdf');
    expect(key).toMatch(/^material\/\d{4}\/\d{2}\/file-1\/методичка\.pdf$/);
    await storage.put(key, Buffer.from('hello'));
    expect(await storage.exists(key)).toBe(true);
    const chunks: Buffer[] = [];
    for await (const c of await storage.get(key)) chunks.push(Buffer.from(c));
    expect(Buffer.concat(chunks).toString()).toBe('hello');
    await storage.delete(key);
    expect(await storage.exists(key)).toBe(false);
  });

  it('подписанные ссылки проверяются и не подделываются', async () => {
    const target = await storage.createUploadTarget('k/1', {
      contentType: 'text/plain',
      sizeBytes: 5,
    });
    const token = decodeURIComponent(target.url.split('/files/local/')[1]!);
    expect(storage.verifyToken(token, 'upload')).toMatchObject({ key: 'k/1', op: 'upload' });
    expect(() => storage.verifyToken(token, 'download')).toThrow();
    expect(() => storage.verifyToken(`${token}x`, 'upload')).toThrow();
    const download = await storage.createDownloadUrl('k/1');
    expect(download).toContain('/api/v1/files/local/');
  });

  it('не выпускает за пределы корня', async () => {
    await expect(storage.exists('../etc/passwd')).rejects.toThrow();
  });
});
