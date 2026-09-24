import type { MeDto } from '@edu/contracts';
import { render, screen } from '@testing-library/react';
import {
  createMemoryRouter,
  MemoryRouter,
  Route,
  RouterProvider,
  Routes,
  useLocation,
} from 'react-router';
import { afterEach, beforeEach, describe, expect, it, vi } from 'vitest';
import '@/shared/i18n';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import { RootRedirect, rootPath } from './root-redirect';
import { RouteErrorScreen } from './route-error';
import { rootRoutes, routes } from './router';
import { StudentShell } from './shells';

const me = (overrides: Partial<MeDto> = {}): MeDto => ({
  user: {
    id: '00000000-0000-7000-8000-000000000011',
    firstName: 'Алексей',
    lastName: null,
    nickname: null,
    avatarUrl: null,
  },
  roles: ['STUDENT'],
  activeRole: 'STUDENT',
  needsRoleSetup: false,
  settings: { theme: 'SYSTEM', locale: 'ru' },
  student: {
    id: '00000000-0000-7000-8000-000000000021',
    onboardingCompleted: true,
    schoolId: null,
    linkCode: 'ALX123',
    classLabel: null,
  },
  parent: null,
  teacher: null,
  ...overrides,
});

function Location() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderRoot() {
  render(
    <MemoryRouter initialEntries={['/']}>
      <Location />
      <Routes>
        <Route path="/" element={<RootRedirect />} />
        <Route path="/auth" element={<div>login</div>} />
        <Route path="/auth/role" element={<div>role setup</div>} />
        <Route path="/onboarding" element={<div>onboarding</div>} />
        <Route path="/student" element={<div>student home</div>} />
        <Route path="/teacher" element={<div>teacher home</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const pathname = () => screen.getByTestId('location').textContent;

describe('RootRedirect', () => {
  beforeEach(() => resetAuthStore());

  it('anonymous → /auth', () => {
    useAuthStore.setState({ status: 'anonymous', me: null });
    renderRoot();
    expect(pathname()).toBe('/auth');
    expect(screen.getByText('login')).toBeInTheDocument();
  });

  it('student → /student', () => {
    useAuthStore.setState({ status: 'authenticated', me: me() });
    renderRoot();
    expect(pathname()).toBe('/student');
    expect(screen.getByText('student home')).toBeInTheDocument();
  });

  it('student без онбординга → /onboarding', () => {
    useAuthStore.setState({
      status: 'authenticated',
      me: me({
        student: {
          id: 'x',
          onboardingCompleted: false,
          schoolId: null,
          linkCode: 'A',
          classLabel: null,
        },
      }),
    });
    renderRoot();
    expect(pathname()).toBe('/onboarding');
  });

  it('needsRoleSetup → /auth/role; teacher → /teacher', () => {
    expect(
      rootPath({
        status: 'authenticated',
        me: me({ roles: [], activeRole: null, needsRoleSetup: true }),
      }),
    ).toBe('/auth/role');
    expect(
      rootPath({
        status: 'authenticated',
        me: me({ roles: ['TEACHER'], activeRole: 'TEACHER', student: null }),
      }),
    ).toBe('/teacher');
  });

  it('до bootstrap показывает сплэш', () => {
    useAuthStore.setState({ status: 'loading' });
    renderRoot();
    expect(pathname()).toBe('/');
    expect(screen.getByRole('status')).toBeInTheDocument();
  });
});

const notOnboarded = () =>
  me({
    student: {
      id: 'x',
      onboardingCompleted: false,
      schoolId: null,
      linkCode: 'A',
      classLabel: null,
    },
  });

function renderStudentShell(path: string) {
  const router = createMemoryRouter(
    [
      {
        path: '/student',
        element: <StudentShell />,
        children: [
          { index: true, element: <div>student home</div> },
          { path: 'assignments', element: <div>assignments</div> },
        ],
      },
      { path: '/onboarding', element: <div>onboarding</div> },
      { path: '/auth', element: <div>login</div> },
    ],
    { initialEntries: [path] },
  );
  render(<RouterProvider router={router} />);
  return router;
}

describe('StudentShell: онбординг', () => {
  beforeEach(() => resetAuthStore());

  it('прямой заход на /student/assignments без онбординга → /onboarding', () => {
    useAuthStore.setState({ status: 'authenticated', me: notOnboarded() });
    const router = renderStudentShell('/student/assignments');
    expect(router.state.location.pathname).toBe('/onboarding');
    expect(screen.getByText('onboarding')).toBeInTheDocument();
    expect(screen.queryByText('assignments')).not.toBeInTheDocument();
  });

  it('онбординг пройден → экран ученика', () => {
    useAuthStore.setState({ status: 'authenticated', me: me() });
    const router = renderStudentShell('/student/assignments');
    expect(router.state.location.pathname).toBe('/student/assignments');
    expect(screen.getByText('assignments')).toBeInTheDocument();
  });
});

describe('errorElement роутера', () => {
  afterEach(() => vi.restoreAllMocks());

  it('корень приложения — pathless-роут с errorElement над всеми маршрутами', () => {
    expect(rootRoutes).toHaveLength(1);
    expect(rootRoutes[0]?.errorElement).toBeTruthy();
    expect(rootRoutes[0]?.path).toBeUndefined();
    expect(rootRoutes[0]?.children).toBe(routes);
  });

  it('ошибка рендера страницы → наш экран с «Перезагрузить», а не дефолтный экран роутера', () => {
    const consoleError = vi.spyOn(console, 'error').mockImplementation(() => {});
    function Boom(): never {
      throw new Error('boom');
    }
    const router = createMemoryRouter(
      [{ errorElement: <RouteErrorScreen />, children: [{ path: '/', element: <Boom /> }] }],
      { initialEntries: ['/'] },
    );
    render(<RouterProvider router={router} />);
    expect(screen.getByText('Что-то сломалось')).toBeInTheDocument();
    expect(screen.getByText('boom')).toBeInTheDocument();
    expect(screen.getByRole('button', { name: 'Перезагрузить' })).toBeInTheDocument();
    expect(screen.queryByText(/Unexpected Application Error/)).not.toBeInTheDocument();
    expect(consoleError).toHaveBeenCalledWith('[app] ошибка роута', expect.any(Error));
  });
});
