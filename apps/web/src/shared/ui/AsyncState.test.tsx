/**
 * QueryError: «Раздел в разработке» — только для NOT_IMPLEMENTED (501 или голый 404); NOT_FOUND с
 * телом ApiError — «Не найдено». Повтора нет ни там, ни там; у прочих ошибок — есть.
 */
import { render, screen } from '@testing-library/react';
import { describe, expect, it } from 'vitest';
import { ApiClientError } from '../api/errors';
import '../i18n';
import { QueryError } from './AsyncState';

const error = (code: 'NOT_FOUND' | 'NOT_IMPLEMENTED' | 'INTERNAL', status: number) =>
  new ApiClientError({ code, message: 'x', status });

describe('QueryError', () => {
  it('NOT_IMPLEMENTED — «Раздел в разработке» без повтора', () => {
    render(<QueryError error={error('NOT_IMPLEMENTED', 501)} onRetry={() => undefined} />);
    expect(screen.getByText('Раздел в разработке')).toBeInTheDocument();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('NOT_FOUND — «Не найдено», а не «Раздел в разработке», без повтора', () => {
    render(<QueryError error={error('NOT_FOUND', 404)} onRetry={() => undefined} />);
    expect(screen.getByText('Не найдено')).toBeInTheDocument();
    expect(screen.queryByText('Раздел в разработке')).toBeNull();
    expect(screen.queryByRole('button')).toBeNull();
  });

  it('прочие ошибки — с повтором', () => {
    render(<QueryError error={error('INTERNAL', 500)} onRetry={() => undefined} />);
    expect(screen.getByRole('button', { name: 'Повторить' })).toBeInTheDocument();
  });
});
