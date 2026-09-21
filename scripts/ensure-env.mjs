#!/usr/bin/env node
// Создаёт .env из .env.example, если его ещё нет. Используется в `pnpm setup`.
import { copyFileSync, existsSync } from 'node:fs';
import path from 'node:path';
import { fileURLToPath } from 'node:url';

const root = path.resolve(path.dirname(fileURLToPath(import.meta.url)), '..');
const env = path.join(root, '.env');
if (!existsSync(env)) {
  copyFileSync(path.join(root, '.env.example'), env);
  console.log('env: создан .env из .env.example');
} else {
  console.log('env: .env уже существует');
}
