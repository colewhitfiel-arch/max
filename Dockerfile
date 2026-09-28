# syntax=docker/dockerfile:1

# Production-упаковка монорепо: одна сборка -> два runtime-образа (api и web).
# Мини-приложение MAX требует один https-origin, поэтому статика и /api/ отдаются
# из одного nginx (см. infra/nginx.conf), а api проксируется внутрь сети compose.
#
# Сборка: docker compose up -d --build   (BuildKit обязателен: используются cache-mount'ы)

ARG NODE_IMAGE=node:22-alpine
ARG NGINX_IMAGE=nginx:alpine
# Держать в синхроне с packages/db/package.json (devDependency "prisma") и pnpm-lock.yaml.
ARG PRISMA_VERSION=6.19.3

# ---------------------------------------------------------------------------
# base — общий слой с pnpm через corepack
# ---------------------------------------------------------------------------
FROM ${NODE_IMAGE} AS base
ENV PNPM_HOME=/pnpm \
    PATH=/pnpm:$PATH \
    COREPACK_ENABLE_DOWNLOAD_PROMPT=0
# openssl — обязателен для движка Prisma под linux-musl (в alpine его нет из коробки).
# Версия pnpm берётся из поля packageManager корневого package.json.
RUN apk add --no-cache openssl && mkdir -p /pnpm && corepack enable
WORKDIR /app

# ---------------------------------------------------------------------------
# deps — установка зависимостей по манифестам (слой кэшируется, пока не менялся lock)
# ---------------------------------------------------------------------------
FROM base AS deps
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/ai/package.json packages/ai/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --store-dir=/pnpm/store

# ---------------------------------------------------------------------------
# build — turbo собирает packages + apps (для @edu/db сначала prisma generate)
# ---------------------------------------------------------------------------
FROM deps AS build

# Vite инлайнит VITE_* на этапе сборки. Для одного origin база API — относительный путь.
ARG VITE_API_URL=/api/v1
ARG VITE_API_MODE=real
ARG VITE_MAX_MODE=real
ARG VITE_AUTH_MODE=auto
ARG VITE_SUPPORT_URL=
ENV VITE_API_URL=${VITE_API_URL} \
    VITE_API_MODE=${VITE_API_MODE} \
    VITE_MAX_MODE=${VITE_MAX_MODE} \
    VITE_AUTH_MODE=${VITE_AUTH_MODE} \
    VITE_SUPPORT_URL=${VITE_SUPPORT_URL}

# prisma generate читает datasource и требует переменную; к БД не подключается.
# Реальный DATABASE_URL приходит в runtime из окружения compose.
ENV DATABASE_URL=postgresql://build:build@localhost:5432/build?schema=public

COPY . .
RUN pnpm build

# ---------------------------------------------------------------------------
# runtime-api — NestJS: только prod-зависимости, собранные dist и prisma-артефакты
# ---------------------------------------------------------------------------
FROM base AS runtime-api
ARG PRISMA_VERSION
# CHECKPOINT_DISABLE — Prisma не ходит в сеть за проверкой обновлений при каждом старте.
ENV NODE_ENV=production \
    CHECKPOINT_DISABLE=1

# prisma CLI нужен только для `migrate deploy` на старте: в prod-установке его нет
# (это devDependency пакета @edu/db).
RUN npm install -g prisma@${PRISMA_VERSION} --no-audit --no-fund

# Тот же набор манифестов — pnpm ставит prod-зависимости api и его workspace-пакетов.
COPY package.json pnpm-lock.yaml pnpm-workspace.yaml .npmrc ./
COPY apps/api/package.json apps/api/
COPY apps/web/package.json apps/web/
COPY packages/ai/package.json packages/ai/
COPY packages/config/package.json packages/config/
COPY packages/contracts/package.json packages/contracts/
COPY packages/db/package.json packages/db/
COPY packages/ui/package.json packages/ui/
RUN --mount=type=cache,id=pnpm-store,target=/pnpm/store \
    pnpm install --frozen-lockfile --prod --ignore-scripts \
    --filter "@edu/api..." --store-dir=/pnpm/store

# Собранные артефакты. Пути соответствуют package.json каждого пакета:
# @edu/db -> dist/index.js, который требует ../generated/client (клиент Prisma
# генерируется в packages/db/generated/client, output задан в prisma/schema/base.prisma).
COPY --from=build /app/apps/api/dist ./apps/api/dist
COPY --from=build /app/packages/contracts/dist ./packages/contracts/dist
COPY --from=build /app/packages/ai/dist ./packages/ai/dist
COPY --from=build /app/packages/db/dist ./packages/db/dist
COPY --from=build /app/packages/db/generated ./packages/db/generated
COPY --from=build /app/packages/db/prisma ./packages/db/prisma

# Локальное хранилище файлов (STORAGE_DRIVER=local); сюда монтируется volume.
RUN mkdir -p /app/.data/storage && chown -R node:node /app/.data
USER node
EXPOSE 3000

# Миграции применяются перед стартом. Схема многофайловая (папка prisma/schema),
# каталог миграций лежит внутри неё — prisma/schema/migrations.
# SEED_ON_START=1 (по умолчанию в compose.yaml) — затем идемпотентный seed демо-мира: школа с кодом
# SCHOOL1, демо-пользователи, кружки, курс. Он собран в packages/db/dist/seed (tsx в образе нет),
# фикстуры берёт из @edu/contracts/fixtures (contracts/dist), клиент — из packages/db/generated.
# Упавший seed не даёт api стартовать: контейнер перезапускается и пробует снова.
# Worker отдельным сервисом не нужен: QUEUE_DRIVER=inline, задачи выполняются в процессе api.
# Чтобы включить его при QUEUE_DRIVER=bullmq — добавить сервис с
# CMD ["node", "apps/api/dist/worker.js"] и REDIS_URL (см. комментарий в compose.yaml).
CMD ["sh", "-c", "prisma migrate deploy --schema=/app/packages/db/prisma/schema && if [ \"$SEED_ON_START\" = \"1\" ]; then node packages/db/dist/seed/index.js; fi && exec node apps/api/dist/main.js"]

# ---------------------------------------------------------------------------
# runtime-web — nginx: SPA + прокси /api/ на сервис api (единый origin)
# ---------------------------------------------------------------------------
FROM ${NGINX_IMAGE} AS runtime-web
COPY infra/nginx.conf /etc/nginx/conf.d/default.conf
COPY --from=build /app/apps/web/dist /usr/share/nginx/html
EXPOSE 80
