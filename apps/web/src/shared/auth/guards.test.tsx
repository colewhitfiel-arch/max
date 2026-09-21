import type { MeDto } from '@edu/contracts';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import { Can, RequireAuth, RequirePermission, RequireRole } from './guards';
import { resetAuthStore, useAuthStore } from './store';

const me = (activeRole: MeDto['activeRole']): MeDto => ({
  user: {
    id: '00000000-0000-7000-8000-000000000011',
    firstName: 'Тест',
    lastName: null,
    nickname: null,
    avatarUrl: null,
  },
  roles: activeRole ? [activeRole] : [],
  activeRole,
  needsRoleSetup: !activeRole,
  settings: { theme: 'SYSTEM', locale: 'ru' },
  student: null,
  parent: null,
  teacher: null,
});

function Location() {
  const location = useLocation();
  return <div data-testid="location">{location.pathname}</div>;
}

function renderGuarded(element: React.ReactNode) {
  render(
    <MemoryRouter initialEntries={['/guarded']}>
      <Location />
      <Routes>
        <Route path="/guarded" element={element} />
        <Route path="/auth" element={<div>login page</div>} />
        <Route path="/auth/role" element={<div>role setup</div>} />
        <Route path="/student" element={<div>student home</div>} />
        <Route path="/parent" element={<div>parent home</div>} />
        <Route path="/403" element={<div>forbidden page</div>} />
      </Routes>
    </MemoryRouter>,
  );
}

const pathname = () => screen.getByTestId('location').textContent;

describe('auth guards', () => {
  beforeEach(() => resetAuthStore());

  it('RequireAuth: anonymous → /auth', () => {
    useAuthStore.setState({ status: 'anonymous', me: null });
    renderGuarded(
      <RequireAuth>
        <div>secret</div>
      </RequireAuth>,
    );
    expect(pathname()).toBe('/auth');
    expect(screen.getByText('login page')).toBeInTheDocument();
  });

  it('RequireAuth: authenticated → рендерит children', () => {
    useAuthStore.setState({ status: 'authenticated', me: me('STUDENT') });
    renderGuarded(
      <RequireAuth>
        <div>secret</div>
      </RequireAuth>,
    );
    expect(screen.getByText('secret')).toBeInTheDocument();
  });

  it('RequireRole: чужая роль → корень своей роли', () => {
    useAuthStore.setState({ status: 'authenticated', me: me('PARENT') });
    renderGuarded(
      <RequireRole role="STUDENT">
        <div>student only</div>
      </RequireRole>,
    );
    expect(pathname()).toBe('/parent');
    expect(screen.getByText('parent home')).toBeInTheDocument();
  });

  it('RequireRole: без активной роли → выбор роли', () => {
    useAuthStore.setState({ status: 'authenticated', me: me(null) });
    renderGuarded(
      <RequireRole role="STUDENT">
        <div>student only</div>
      </RequireRole>,
    );
    expect(pathname()).toBe('/auth/role');
  });

  it('RequirePermission: по ROLE_PERMISSIONS — родитель не отмечает посещаемость', () => {
    useAuthStore.setState({ status: 'authenticated', me: me('PARENT') });
    renderGuarded(
      <RequirePermission permission="teacher:attendance.mark">
        <div>mark</div>
      </RequirePermission>,
    );
    expect(pathname()).toBe('/403');
    expect(screen.getByText('forbidden page')).toBeInTheDocument();
  });

  it('RequirePermission и Can: преподаватель отмечает посещаемость', () => {
    useAuthStore.setState({ status: 'authenticated', me: me('TEACHER') });
    renderGuarded(
      <RequirePermission permission="teacher:attendance.mark">
        <Can permission="teacher:attendance.mark" fallback={<div>no</div>}>
          <div>mark</div>
        </Can>
        <Can permission="parent:payments.pay" fallback={<div>cannot pay</div>}>
          <div>pay</div>
        </Can>
      </RequirePermission>,
    );
    expect(screen.getByText('mark')).toBeInTheDocument();
    expect(screen.getByText('cannot pay')).toBeInTheDocument();
    expect(screen.queryByText('pay')).not.toBeInTheDocument();
  });
});
