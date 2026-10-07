import { cleanup, fireEvent, render, screen, waitFor } from '@testing-library/react';
import { MemoryRouter, Route, Routes, useLocation } from 'react-router-dom';
import { afterEach, describe, expect, it, vi } from 'vitest';
import Register from './Register';

const register = vi.fn();
vi.mock('../../hooks/useAuth', () => ({ useAuth: () => ({ register, googleMode: false }) }));
vi.mock('../../hooks/useToast', () => ({ useToast: () => vi.fn() }));

function Donde() {
  const l = useLocation();
  return <p data-testid="donde">{l.pathname + l.search}</p>;
}

function montar(url: string) {
  render(
    <MemoryRouter initialEntries={[url]}>
      <Routes>
        <Route path="/registro" element={<Register />} />
        <Route path="*" element={<Donde />} />
      </Routes>
    </MemoryRouter>,
  );
}

function rellenarYEnviar() {
  fireEvent.change(document.getElementById('full_name')!, { target: { value: 'Ana Pérez' } });
  fireEvent.change(document.getElementById('email')!, { target: { value: 'ana@correo.com' } });
  fireEvent.change(document.getElementById('phone')!, { target: { value: '+53 5 123 4567' } });
  fireEvent.change(document.getElementById('password')!, { target: { value: 'clavesegura1' } });
  fireEvent.click(screen.getByRole('button', { name: /crear cuenta profesional/i }));
}

afterEach(() => { cleanup(); vi.clearAllMocks(); });

describe('Registro de un negocio por correo', () => {
  it('con destino, termina en él (así el código de DardoVentas no se pierde)', async () => {
    register.mockResolvedValue(undefined);
    montar(`/registro?tipo=provider&next=${encodeURIComponent('/vincular/dardoventas?code=x')}`);
    rellenarYEnviar();
    await waitFor(() => expect(screen.getByTestId('donde').textContent).toBe('/vincular/dardoventas?code=x'));
  });

  it('sin destino, sigue yendo a completar el perfil', async () => {
    register.mockResolvedValue(undefined);
    montar('/registro?tipo=provider');
    rellenarYEnviar();
    await waitFor(() => expect(screen.getByTestId('donde').textContent).toBe('/dashboard/perfil'));
  });
});
