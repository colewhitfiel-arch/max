import type { MeDto } from '@edu/contracts';
import { render, screen } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router';
import { beforeEach, describe, expect, it } from 'vitest';
import '@/shared/i18n';
import { resetAuthStore, useAuthStore } from '@/shared/auth/store';
import { RootRedirect, rootPath } from './root-redirect';

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
