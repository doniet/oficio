import { describe, expect, it, vi } from 'vitest';
import { crearCliente, ErrorApi } from '../src/api';

const respuesta = (status: number, body: unknown) =>
  Promise.resolve(new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } }));

describe('crearCliente', () => {
  it('manda el token y parsea la respuesta', async () => {
    const fetchImpl = vi.fn(() => respuesta(200, { count: 3 }));
    const api = crearCliente({ baseUrl: 'https://x/api', getToken: () => 'T', fetchImpl });
    expect(await api.conversaciones.noLeidos()).toEqual({ count: 3 });
    const [url, init] = fetchImpl.mock.calls[0] as unknown as [string, RequestInit];
    expect(url).toBe('https://x/api/conversations/unread-count');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer T');
  });

  it('omite parámetros vacíos en la query', async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) => respuesta(200, { services: [], pagination: {} }));
    const api = crearCliente({ baseUrl: 'https://x/api', getToken: () => null, fetchImpl });
    await api.servicios.listar({ sort: 'newest', q: '', province_id: undefined, page: 2 });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://x/api/services?sort=newest&page=2');
  });

  it('destacados y estadísticas de categorías usan los endpoints de la portada web', async () => {
    const fetchImpl = vi.fn((_url: string, _init?: RequestInit) => respuesta(200, { providers: [], categories: [] }));
    const api = crearCliente({ baseUrl: 'https://x/api', getToken: () => null, fetchImpl });
    await api.proveedores.destacados(4);
    await api.categorias.estadisticas();
    expect(fetchImpl.mock.calls.map((c) => c[0])).toEqual(['https://x/api/providers/featured?limit=4', 'https://x/api/stats/categories']);
  });

  it('convierte el error del backend en ErrorApi con su mensaje', async () => {
    const api = crearCliente({ baseUrl: 'https://x/api', getToken: () => null, fetchImpl: () => respuesta(400, { error: 'Email inválido' }) });
    await expect(api.auth.login({ email: 'a', password: 'b' })).rejects.toMatchObject({ status: 400, message: 'Email inválido' });
  });

  it('401 con sesión llama a onUnauthorized', async () => {
    const onUnauthorized = vi.fn();
    const api = crearCliente({ baseUrl: 'https://x/api', getToken: () => 'T', onUnauthorized, fetchImpl: () => respuesta(401, { error: 'Token inválido' }) });
    await expect(api.auth.me()).rejects.toBeInstanceOf(ErrorApi);
    expect(onUnauthorized).toHaveBeenCalledOnce();
  });

  it('401 sin sesión (login fallido) NO llama a onUnauthorized', async () => {
    const onUnauthorized = vi.fn();
    const api = crearCliente({ baseUrl: 'https://x/api', getToken: () => null, onUnauthorized, fetchImpl: () => respuesta(401, { error: 'Credenciales inválidas' }) });
    await expect(api.auth.login({ email: 'a@b.cu', password: 'x' })).rejects.toMatchObject({ status: 401 });
    expect(onUnauthorized).not.toHaveBeenCalled();
  });

  it('sin red → status 0 con mensaje claro', async () => {
    const api = crearCliente({ baseUrl: 'https://x/api', getToken: () => null, fetchImpl: () => Promise.reject(new TypeError('Network request failed')) });
    await expect(api.servicios.listar()).rejects.toMatchObject({ status: 0, message: 'Sin conexión. Revisa tu internet e inténtalo de nuevo.' });
  });

  it('timeout → status 0', async () => {
    vi.useFakeTimers();
    const fetchImpl = vi.fn((_u: string, init: RequestInit) => new Promise<Response>((_, rej) => {
      init.signal!.addEventListener('abort', () => rej(new DOMException('aborted', 'AbortError')));
    }));
    const api = crearCliente({ baseUrl: 'https://x/api', getToken: () => null, fetchImpl: fetchImpl as unknown as typeof fetch, timeoutMs: 1000 });
    const p = api.servicios.listar();
    vi.advanceTimersByTime(1001);
    await expect(p).rejects.toMatchObject({ status: 0 });
    vi.useRealTimers();
  });
});
