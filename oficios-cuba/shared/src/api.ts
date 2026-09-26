import type { CategoryStat, Conversation, DispositivoPush, Message, PaginaServicios, ProviderCard, Review, ServiceDetail, ServiceSummary, SesionUsuario, User } from './tipos';
import type { DatosLogin, DatosRegistro } from './validacion';

export class ErrorApi extends Error {
  constructor(public status: number, message: string) {
    super(message);
    this.name = 'ErrorApi';
  }
}

export interface OpcionesCliente {
  baseUrl: string;
  getToken: () => Promise<string | null> | string | null;
  onUnauthorized?: () => void;
  timeoutMs?: number;
  fetchImpl?: typeof fetch;
}

type Query = Record<string, string | number | undefined>;

function esPromesa(valor: unknown): valor is Promise<string | null> {
  return !!valor && typeof (valor as { then?: unknown }).then === 'function';
}

export function crearCliente({ baseUrl, getToken, onUnauthorized, timeoutMs = 20000, fetchImpl = fetch }: OpcionesCliente) {
  async function pedir<T>(metodo: string, ruta: string, cuerpo?: unknown, query?: Query): Promise<T> {
    const qs = query
      ? Object.entries(query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
      : '';
    // Si getToken es síncrono, NO se usa `await` sobre su valor: un `await` siempre cede un tick de
    // microtarea aunque el valor no sea una promesa, y eso corre el AbortController+setTimeout de más
    // abajo un tick después de lo esperado por quien llama — con fake timers eso deja el setTimeout sin
    // registrar todavía cuando el que llama avanza el reloj, y el timeout nunca se dispara.
    const resultadoToken = getToken();
    const token = esPromesa(resultadoToken) ? await resultadoToken : resultadoToken;
    const headers: Record<string, string> = { Accept: 'application/json' };
    if (token) headers.Authorization = `Bearer ${token}`;
    if (cuerpo !== undefined) headers['Content-Type'] = 'application/json';

    const control = new AbortController();
    const reloj = setTimeout(() => control.abort(), timeoutMs);
    let res: Response;
    try {
      res = await fetchImpl(`${baseUrl}${ruta}${qs ? `?${qs}` : ''}`, {
        method: metodo, headers, body: cuerpo === undefined ? undefined : JSON.stringify(cuerpo), signal: control.signal,
      });
    } catch {
      throw new ErrorApi(0, 'Sin conexión. Revisa tu internet e inténtalo de nuevo.');
    } finally {
      clearTimeout(reloj);
    }

    const datos = await res.json().catch(() => ({}));
    if (!res.ok) {
      // Solo se cierra la sesión si había una: un login fallido también es 401.
      if (res.status === 401 && token) onUnauthorized?.();
      throw new ErrorApi(res.status, (datos as { error?: string }).error ?? 'Algo salió mal. Inténtalo de nuevo.');
    }
    return datos as T;
  }

  return {
    auth: {
      login: (d: DatosLogin) => pedir<SesionUsuario>('POST', '/auth/login', d),
      register: (d: DatosRegistro) => pedir<SesionUsuario>('POST', '/auth/register', d),
      me: () => pedir<{ user: User }>('GET', '/auth/me'),
    },
    servicios: {
      listar: (q?: Query) => pedir<PaginaServicios>('GET', '/services', undefined, q),
      detalle: (id: string) => pedir<{ service: ServiceDetail; reviews: Review[]; related: ServiceSummary[] }>('GET', `/services/${encodeURIComponent(id)}`),
    },
    /** Categorías principales con su nº de servicios (cuadrícula de la portada). */
    categorias: {
      estadisticas: () => pedir<{ categories: CategoryStat[] }>('GET', '/stats/categories'),
    },
    proveedores: {
      destacados: (limit = 6) => pedir<{ providers: ProviderCard[] }>('GET', '/providers/featured', undefined, { limit }),
      /** Deja constancia de que el cliente contactó por WhatsApp/llamada (vale para poder reseñar). 204. */
      contacto: (id: string, via: 'whatsapp' | 'call') => pedir<void>('POST', `/providers/${encodeURIComponent(id)}/contact`, { via }),
    },
    /** CUP por 1 USD. En prod lo sirve nginx desde dardoventas.com; la API da el respaldo. */
    tasa: () => pedir<{ usd: number; updated_at: string | null; fuente: string }>('GET', '/tasas'),
    conversaciones: {
      listar: () => pedir<{ conversations: Conversation[] }>('GET', '/conversations'),
      noLeidos: () => pedir<{ count: number }>('GET', '/conversations/unread-count'),
      detalle: (id: string, after?: string) => pedir<{ conversation: Conversation; messages: Message[] }>('GET', `/conversations/${encodeURIComponent(id)}`, undefined, { after }),
      crear: (d: { provider_id: string; service_id?: string; initial_message: string }) => pedir<{ conversation: { id: string } }>('POST', '/conversations', d),
      enviar: (id: string, content: string) => pedir<{ message: Message }>('POST', `/conversations/${encodeURIComponent(id)}/messages`, { content }),
    },
    push: {
      registrar: (d: DispositivoPush) => pedir<void>('POST', '/push/devices', d),
      borrar: (token: string) => pedir<void>('DELETE', `/push/devices/${encodeURIComponent(token)}`),
    },
  };
}

export type ClienteApi = ReturnType<typeof crearCliente>;
