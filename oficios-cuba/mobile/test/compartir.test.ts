import { Share } from 'react-native';

jest.mock('../src/lib/api', () => ({ origenWeb: jest.fn(() => 'https://oficio.dardoit.com') }));

import { compartirPerfil, esCancelacion, urlPerfil } from '../src/lib/compartir';

// Se espía el método real en vez de reemplazar todo el módulo 'react-native': jest-expo necesita
// el resto del módulo intacto durante su propio setup (Platform, NativeModules…).
const mockShare = jest.spyOn(Share, 'share');

beforeEach(() => {
  mockShare.mockReset();
});

describe('urlPerfil', () => {
  it('arma la URL web sobre origenWeb(), no un deep link', () => {
    expect(urlPerfil('p1')).toBe('https://oficio.dardoit.com/proveedor/p1');
  });

  it('escapa el id', () => {
    expect(urlPerfil('a b/c')).toBe('https://oficio.dardoit.com/proveedor/a%20b%2Fc');
  });
});

describe('esCancelacion', () => {
  it('dismissedAction (iOS) es cancelación', () => {
    expect(esCancelacion({ action: 'dismissedAction' })).toBe(true);
  });

  it('sharedAction no es cancelación', () => {
    expect(esCancelacion({ action: 'sharedAction' })).toBe(false);
  });

  it('un rechazo de Android (sin action) también es cancelación', () => {
    expect(esCancelacion(new Error('user cancelled'))).toBe(true);
    expect(esCancelacion(undefined)).toBe(true);
  });
});

describe('compartirPerfil', () => {
  it('llama a Share.share con el título y la URL del perfil', async () => {
    mockShare.mockResolvedValue({ action: 'sharedAction' });
    await compartirPerfil('p1', 'Taller de Juan');
    expect(mockShare).toHaveBeenCalledWith({ title: 'Taller de Juan', url: 'https://oficio.dardoit.com/proveedor/p1' });
  });

  it('dismissedAction (iOS) resuelve sin lanzar', async () => {
    mockShare.mockResolvedValue({ action: 'dismissedAction' });
    await expect(compartirPerfil('p1', 'Taller de Juan')).resolves.toBeUndefined();
  });

  it('un rechazo de Android (cancelar) resuelve sin lanzar', async () => {
    mockShare.mockRejectedValue(new Error('cancelado'));
    await expect(compartirPerfil('p1', 'Taller de Juan')).resolves.toBeUndefined();
  });
});
