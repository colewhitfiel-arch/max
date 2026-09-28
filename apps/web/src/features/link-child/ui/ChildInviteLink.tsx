import type { ChildrenList } from '@edu/contracts';
import {
  Button,
  CopyIcon,
  ErrorState,
  Field,
  Input,
  LinkIcon,
  SendIcon,
  Stack,
  Text,
  useToast,
} from '@edu/ui';
import { useEffect, useRef } from 'react';
import { useTranslation } from 'react-i18next';
import { useChildren, useCodeLinkedChildren, useCreateChildInvite } from '@/entities/student';
import { describeApiError } from '@/shared/api/errors';
import { formatDate } from '@/shared/lib/dates';
import { fullName } from '@/shared/lib/format';
import { useMaxBridge } from '@/shared/max';

/** Как часто проверять, принял ли ребёнок приглашение, пока ссылка на экране. */
export const INVITE_ACCEPT_POLL_MS = 5_000;

/** Системное «Поделиться» (в MAX/мобильном WebView); на десктопе его обычно нет — копируем. */
function canShare(): boolean {
  return typeof navigator !== 'undefined' && typeof navigator.share === 'function';
}

/** Пользователь закрыл системное окно «Поделиться» — это не ошибка. */
function isShareAbort(cause: unknown): boolean {
  return cause instanceof DOMException && cause.name === 'AbortError';
}

/**
 * Запасное копирование для WebView без Clipboard API (или без разрешения на него): выделяем
 * текст поля со ссылкой и копируем командой документа.
 */
function copyFromInput(input: HTMLInputElement | null): boolean {
  if (!input || typeof document.execCommand !== 'function') return false;
  input.focus();
  input.select();
  try {
    return document.execCommand('copy');
  } catch {
    return false;
  }
}

/** Дети со связью ACTIVE: только они «появляются» у родителя. */
function activeIds(list: ChildrenList | undefined): Set<string> {
  return new Set(
    (list?.items ?? [])
      .filter((child) => child.linkStatus === 'ACTIVE')
      .map((child) => child.student.id),
  );
}

export interface ChildInviteLinkProps {
  /**
   * Ребёнок принял приглашение — в списке детей появилась новая активная связь (список
   * перечитывается, пока ссылка на экране). Ссылка одноразовая: после этого можно создать новую.
   */
  onAccepted?: (studentId: string) => void;
}

/**
 * Приглашение ребёнка по ссылке (docs/07 F14): `POST /parent/children/invites` → ссылка
 * (диплинк мини-приложения MAX), которую родитель отправляет ребёнку («Поделиться» или
 * копирование). Ребёнок открывает её, подтверждает — и появляется в списке детей: пока ссылка
 * на экране, список детей перечитывается, и родитель сразу видит, что приглашение принято.
 */
export function ChildInviteLink({ onAccepted }: ChildInviteLinkProps = {}) {
  const { t, i18n } = useTranslation('parent');
  const { t: tc } = useTranslation('common');
  const toast = useToast();
  const bridge = useMaxBridge();
  const create = useCreateChildInvite();
  const invite = create.data;
  const inputRef = useRef<HTMLInputElement>(null);
  const children = useChildren(true, {
    refetchInterval: invite ? INVITE_ACCEPT_POLL_MS : false,
  });
  // Привязка по коду рядом (тот же экран или шторка) — не принятие приглашения.
  const codeLinks = useCodeLinkedChildren();
  const linkingByCode = codeLinks.pending;
  const linkedByCode = codeLinks.links;
  // Кто уже был привязан, когда появилась ссылка: новый ACTIVE сверх них — принявший ребёнок.
  const baselineRef = useRef<Set<string> | null>(null);
  // Привязки по коду, завершённые до ссылки (их дети уже в базе или с тех пор отвязаны).
  const earlierCodeLinksRef = useRef<Set<number>>(new Set());

  useEffect(() => {
    if (!invite) {
      baselineRef.current = null;
      return;
    }
    if (!children.data) return;
    const current = activeIds(children.data);
    if (!baselineRef.current) {
      baselineRef.current = current;
      return;
    }
    const baseline = baselineRef.current;
    // Привязанные по коду, пока ссылка на экране, — в базу: они появились не по ссылке. Пока
    // привязка по коду идёт, её ребёнок ещё неизвестен — ждём ответа, чтобы не принять его за
    // принявшего ссылку.
    for (const link of linkedByCode) {
      if (link.studentId && !earlierCodeLinksRef.current.has(link.submittedAt)) {
        baseline.add(link.studentId);
      }
    }
    if (linkingByCode) return;
    const accepted = children.data.items.find(
      (child) => child.linkStatus === 'ACTIVE' && !baseline.has(child.student.id),
    );
    if (!accepted) return;
    baselineRef.current = null;
    bridge.haptic('success');
    toast.show({
      tone: 'success',
      title: t('addChild.invite.accepted', {
        name: fullName(accepted.student.user) || tc('user.noName'),
      }),
    });
    // Ссылка погашена — следующему ребёнку нужна новая.
    create.reset();
    onAccepted?.(accepted.student.id);
  }, [
    invite,
    children.data,
    linkingByCode,
    linkedByCode,
    bridge,
    toast,
    t,
    tc,
    create,
    onAccepted,
  ]);

  const startInvite = () => {
    baselineRef.current = children.data ? activeIds(children.data) : null;
    earlierCodeLinksRef.current = new Set(linkedByCode.map((link) => link.submittedAt));
    create.mutate();
  };

  const copy = async (url: string) => {
    try {
      await navigator.clipboard.writeText(url);
    } catch {
      if (!copyFromInput(inputRef.current)) {
        toast.show({ tone: 'warning', title: t('addChild.invite.copyFailed') });
        return;
      }
    }
    bridge.haptic('success');
    toast.show({ tone: 'success', title: t('addChild.invite.copied') });
  };

  const share = async (url: string) => {
    if (!canShare()) return copy(url);
    try {
      await navigator.share({
        title: t('addChild.invite.shareTitle'),
        text: t('addChild.invite.shareText'),
        url,
      });
    } catch (cause) {
      if (!isShareAbort(cause)) await copy(url);
    }
  };

  if (!invite) {
    return (
      <Stack gap={3}>
        {create.isError ? (
          <ErrorState
            title={tc('states.error')}
            description={describeApiError(create.error)}
            onRetry={startInvite}
            retryLabel={tc('actions.retry')}
          />
        ) : (
          <Button
            leftIcon={<LinkIcon />}
            loading={create.isPending}
            onClick={startInvite}
            fullWidth
          >
            {t('addChild.invite.create')}
          </Button>
        )}
        <Text variant="caption" tone="muted">
          {t('addChild.invite.hint')}
        </Text>
      </Stack>
    );
  }

  return (
    <Stack gap={3}>
      <Field
        label={t('addChild.invite.link')}
        hint={t('addChild.invite.expires', { date: formatDate(invite.expiresAt, i18n.language) })}
      >
        <Input
          ref={inputRef}
          value={invite.url}
          readOnly
          onFocus={(event) => event.currentTarget.select()}
          autoComplete="off"
          spellCheck={false}
        />
      </Field>
      {canShare() ? (
        <Button leftIcon={<SendIcon />} onClick={() => void share(invite.url)} fullWidth>
          {t('addChild.invite.share')}
        </Button>
      ) : (
        <Button leftIcon={<CopyIcon />} onClick={() => void copy(invite.url)} fullWidth>
          {t('addChild.invite.copy')}
        </Button>
      )}
      <Text variant="caption" tone="muted" role="status">
        {t('addChild.invite.waiting')}
      </Text>
    </Stack>
  );
}
