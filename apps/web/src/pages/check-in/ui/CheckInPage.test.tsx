/**
 * `/check-in/:code` на MSW-моках (F6a): ученик отмечается по коду из QR, повтор — «уже стоит»;
 * протухший код, чужая группа и открытие не учеником — понятные сообщения. Кнопка на главной:
 * в MAX — встроенный сканер, вне MAX — ввод ссылки.
 */
import { DEMO_IDS } from '@edu/contracts/fixtures';
import { ToastProvider } from '@edu/ui';
import { QueryClientProvider } from '@tanstack/react-query';
import { render, screen, waitFor } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { setupServer } from 'msw/node';
import { I18nextProvider } from 'react-i18next';
import { createMemoryRouter, RouterProvider } from 'react-router';
import { afterAll, afterEach, beforeAll, describe, expect, it, vi } from 'vitest';
import { QrCheckInButton } from '@/features/qr-check-in';
import { api, call } from '@/shared/api/client';
import { queryClient } from '@/shared/api/query-client';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import { i18n } from '@/shared/i18n';
import { type MaxBridge, MaxBridgeProvider, MockMaxBridge } from '@/shared/max';
import { handlers } from '@/test/fake-api/handlers';
import { resetMockDb } from '@/test/fake-api/state';
import { CheckInPage } from './CheckInPage';

const server = setupServer(...handlers);
const WAIT = { timeout: 10_000 };

beforeAll(() => server.listen({ onUnhandledRequest: 'error' }));
afterAll(() => server.close());
afterEach(() => {
  resetAuthStore();
  queryClient.clear();
  resetMockDb();
});

/** Код занятия с экрана преподавателя (Мария). */
async function lessonQr(lessonId: string) {
  await useAuthStore.getState().loginDev('max-teacher-1', ['TEACHER']);
  return call(api.attendance.getAttendanceQr({ params: { lessonId } }));
}

function renderAt(path: string, bridge: MaxBridge = new MockMaxBridge({ launchParams: null })) {
  const router = createMemoryRouter(
    [
      { path: '/check-in/:code', element: <CheckInPage /> },
      { path: '/student', element: <QrCheckInButton /> },
      { path: '/teacher', element: <p>Главная преподавателя</p> },
    ],
    { initialEntries: [path] },
  );
  render(
    <MaxBridgeProvider bridge={bridge}>
      <QueryClientProvider client={queryClient}>
        <ToastProvider>
          <I18nextProvider i18n={i18n}>
            <RouterProvider router={router} />
          </I18nextProvider>
        </ToastProvider>
      </QueryClientProvider>
    </MaxBridgeProvider>,
  );
  return router;
}

/** Мост «внутри MAX» со сканером, который «видит» переданную строку. */
function scannerBridge(value: string | null) {
  const bridge = new MockMaxBridge({ launchParams: null });
  vi.spyOn(bridge, 'canScanQrCode').mockReturnValue(true);
  const scan = vi.spyOn(bridge, 'scanQrCode').mockResolvedValue(value);
  return { bridge, scan };
}

describe('CheckInPage', () => {
  it('ученик группы отмечается по коду занятия', async () => {
    const qr = await lessonQr(DEMO_IDS.lessons.roboticsToday);
    await useAuthStore.getState().loginDev('max-student-2', ['STUDENT']);
    renderAt(`/check-in/${qr.code}`);

    expect(await screen.findByText('Отметка поставлена', {}, WAIT)).toBeVisible();
    expect(screen.getByText(/^Робототехника · \d{2}:\d{2}–\d{2}:\d{2}$/)).toBeVisible();
    expect(screen.getByText('Преподаватель видит, что ты на занятии')).toBeVisible();
  });

  it('повтор тем же кодом ничего не меняет', async () => {
    const qr = await lessonQr(DEMO_IDS.lessons.roboticsToday);
    await useAuthStore.getState().loginDev('max-student-2', ['STUDENT']);
    await call(api.attendance.checkIn({ body: { code: qr.code } }));
    renderAt(`/check-in/${qr.code}`);
    expect(await screen.findByText('Отметка уже стоит', {}, WAIT)).toBeVisible();
  });

  it('занятие чужой группы — «Это занятие не твоей группы», без повторного скана', async () => {
    const qr = await lessonQr(DEMO_IDS.lessons.programmingTomorrow);
    await useAuthStore.getState().loginDev('max-student-2', ['STUDENT']);
    renderAt(`/check-in/${qr.code}`);

    expect(await screen.findByText('Это занятие не твоей группы', {}, WAIT)).toBeVisible();
    expect(screen.queryByRole('button', { name: 'Сканировать снова' })).not.toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'На главную' })).toBeVisible();
  });

  it('протухший код — «Код устарел»; снова сканируем и отмечаемся свежим кодом', async () => {
    const qr = await lessonQr(DEMO_IDS.lessons.roboticsToday);
    await useAuthStore.getState().loginDev('max-student-2', ['STUDENT']);
    const { bridge, scan } = scannerBridge(qr.url);
    const user = userEvent.setup();
    const router = renderAt(`/check-in/qr_${DEMO_IDS.lessons.roboticsToday}_1`, bridge);

    expect(await screen.findByText('Код устарел', {}, WAIT)).toBeVisible();
    await user.click(screen.getByRole('button', { name: 'Сканировать снова' }));
    expect(scan).toHaveBeenCalled();
    await waitFor(() => expect(router.state.location.pathname).toBe(`/check-in/${qr.code}`), WAIT);
    expect(await screen.findByText('Отметка поставлена', {}, WAIT)).toBeVisible();
  });

  it('открыл не ученик — подсказка про роль ученика', async () => {
    const qr = await lessonQr(DEMO_IDS.lessons.roboticsToday);
    renderAt(`/check-in/${qr.code}`);
    expect(await screen.findByText('Отметиться может только ученик', {}, WAIT)).toBeVisible();
  });
});

describe('Кнопка «Отметиться по QR»', () => {
  it('в MAX: сканер → экран отметки с кодом из ссылки', async () => {
    const qr = await lessonQr(DEMO_IDS.lessons.roboticsToday);
    await useAuthStore.getState().loginDev('max-student-2', ['STUDENT']);
    const { bridge } = scannerBridge(qr.url);
    const user = userEvent.setup();
    const router = renderAt('/student', bridge);

    await user.click(screen.getByRole('button', { name: 'Отметиться по QR' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/check-in/${qr.code}`), WAIT);
    expect(await screen.findByText('Отметка поставлена', {}, WAIT)).toBeVisible();
  });

  it('чужой QR — предупреждение, остаёмся на месте; закрытый сканер — ничего', async () => {
    const { bridge, scan } = scannerBridge('https://example.com/menu');
    const user = userEvent.setup();
    const router = renderAt('/student', bridge);

    await user.click(screen.getByRole('button', { name: 'Отметиться по QR' }));
    expect(await screen.findByText('Это не QR-код занятия', {}, WAIT)).toBeVisible();
    expect(router.state.location.pathname).toBe('/student');

    scan.mockResolvedValueOnce(null);
    await user.click(screen.getByRole('button', { name: 'Отметиться по QR' }));
    expect(router.state.location.pathname).toBe('/student');
  });

  it('вне MAX сканера нет — вставляем ссылку из QR вручную', async () => {
    const qr = await lessonQr(DEMO_IDS.lessons.roboticsToday);
    await useAuthStore.getState().loginDev('max-student-2', ['STUDENT']);
    const user = userEvent.setup();
    const router = renderAt('/student');

    await user.click(screen.getByRole('button', { name: 'Отметиться по QR' }));
    const input = await screen.findByLabelText('Ссылка из QR-кода', {}, WAIT);
    await user.type(input, 'не ссылка');
    await user.click(screen.getByRole('button', { name: 'Отметиться' }));
    expect(screen.getByText('Это не QR-код занятия')).toBeVisible();

    await user.clear(input);
    await user.type(input, qr.url);
    await user.click(screen.getByRole('button', { name: 'Отметиться' }));
    await waitFor(() => expect(router.state.location.pathname).toBe(`/check-in/${qr.code}`), WAIT);
    expect(await screen.findByText('Отметка поставлена', {}, WAIT)).toBeVisible();
  });
});
