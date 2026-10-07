import { act, renderHook } from '@testing-library/react';
import { MemoryRouter, useLocation } from 'react-router-dom';
import type { ReactNode } from 'react';
import { describe, expect, it, vi } from 'vitest';
import { useDestinoGoogle } from './GoogleButton';
import type { User } from '../types';

vi.mock('../hooks/useAuth', () => ({ useAuth: () => ({}) }));
vi.mock('../hooks/useToast', () => ({ useToast: () => vi.fn() }));

const proveedor = { user_type: 'provider' } as User;

function destino(isNew: boolean, next: string | null) {
  const wrapper = ({ children }: { children: ReactNode }) => <MemoryRouter initialEntries={['/auth/google']}>{children}</MemoryRouter>;
  const { result } = renderHook(() => ({ ir: useDestinoGoogle(), loc: useLocation() }), { wrapper });
  return { result, ir: () => result.current.ir(proveedor, isNew, next) };
}

describe('useDestinoGoogle', () => {
  it('un negocio nuevo con destino vuelve a él', () => {
    const { result, ir } = destino(true, '/vincular/dardoventas?code=x');
    act(() => ir());
    expect(result.current.loc.pathname + result.current.loc.search).toBe('/vincular/dardoventas?code=x');
  });

  it('un negocio nuevo sin destino va a completar el perfil', () => {
    const { result, ir } = destino(true, null);
    act(() => ir());
    expect(result.current.loc.pathname).toBe('/dashboard/perfil');
  });
});
