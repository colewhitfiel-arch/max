/** Спрос на кружки: категория — человекочитаемой подписью, «назад» — в настройки. */
import { ClubDemandReportSchema } from '@edu/contracts';
import { ToastProvider } from '@edu/ui';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';
import { render, screen } from '@testing-library/react';
import userEvent from '@testing-library/user-event';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { describe, expect, it, vi } from 'vitest';
import '@/shared/i18n';
import { ClubDemandPage } from './ui/ClubDemandPage';

const id = (n: number) => `0190a000-0000-7000-8000-${n.toString(16).padStart(12, '0')}`;

const report = ClubDemandReportSchema.parse({
  students: 3,
  futureInterests: [],
  items: [
    {
      club: {
        id: id(0xc1),
        title: 'Лего-роботы',
        category: 'ROBOTICS',
        coverUrl: null,
        description: '',
        price: { amountKopecks: 0, currency: 'RUB' },
        billingPeriod: 'MONTH',
        tags: [],
        teachers: [],
        schedulePreview: [],
      },
      chosen: 2,
      later: 1,
      skipped: 0,
      avgScore: null,
      reasons: [],
    },
  ],
});

vi.mock('@/entities/ai', () => ({
  useClubDemand: () => ({
    data: report,
    error: null,
    isPending: false,
    isError: false,
    isSuccess: true,
    refetch: vi.fn(),
  }),
}));

function LocationProbe() {
  const location = useLocation();
  return <output data-testid="location">{location.pathname}</output>;
}

function renderPage() {
  const client = new QueryClient({ defaultOptions: { queries: { retry: false } } });
  return render(
    <QueryClientProvider client={client}>
      <ToastProvider>
        <MemoryRouter initialEntries={['/teacher/clubs/demand']}>
          <Routes>
            <Route path="/teacher/clubs/demand" element={<ClubDemandPage />} />
            <Route path="/teacher/settings" element={<p>Настройки</p>} />
          </Routes>
          <LocationProbe />
        </MemoryRouter>
      </ToastProvider>
    </QueryClientProvider>,
  );
}

describe('ClubDemandPage', () => {
  it('категория кружка — подписью, а не значением enum', () => {
    renderPage();
    expect(screen.getByText('Робототехника')).toBeInTheDocument();
    expect(screen.queryByText('ROBOTICS')).not.toBeInTheDocument();
  });

  it('по прямой ссылке «назад» ведёт в настройки', async () => {
    const user = userEvent.setup();
    renderPage();
    await user.click(screen.getByRole('button', { name: 'Назад' }));
    expect(screen.getByTestId('location').textContent).toBe('/teacher/settings');
  });
});
