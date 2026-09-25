# Apps móviles — Parte 1: fundación y prueba de push en Cuba

> **For agentic workers:** REQUIRED SUB-SKILL: Use superpowers:subagent-driven-development (recommended) or superpowers:executing-plans to implement this plan task-by-task. Steps use checkbox (`- [ ]`) syntax for tracking.

**Goal:** Tener `@oficio/shared`, el esqueleto de la app Expo con sesión, el flujo mínimo solicitud → chat, el push de mensajes de punta a punta (backend → FCM → teléfono) y una APK de prueba que la familia de Doniet instala en Cuba para medir si FCM llega.

**Architecture:** Opción A de la spec: `oficios-cuba/shared` (paquete TS puro, consumido con `file:`) y `oficios-cuba/mobile` (Expo SDK 57 + expo-router), junto al `backend/` y `frontend/` existentes. El backend guarda dispositivos en `push_devices` (migración v3) y avisa por una interfaz de canal; el canal real es **FCM HTTP v1 directo** (sin Expo Push Service, ver "Desviación").

**Tech Stack:** TypeScript, zod, vitest (shared, backend), Expo SDK 57 / React Native 0.87 / expo-router, expo-secure-store, expo-notifications, @tanstack/react-query, jest-expo, Express + better-sqlite3, FCM HTTP v1.

**Spec:** `oficios-cuba/docs/superpowers/specs/2026-09-25-apps-moviles-design.md`

**Parte 2 (plan aparte, después de la prueba en Cuba):** resto de pantallas (buscar con filtros, proveedor, favoritos, mis servicios con fotos, cuenta), caché persistida y modo sin conexión, `/api/app/version`, keystore de release, APKs por arquitectura, AAB, descarga en `oficio.dardoit.com/app/`, iOS.

## Desviación respecto de la spec (a confirmar por Dariel al revisar el plan)

La spec §6 dice "canal `expo`: Expo Push Service → FCM/APNs". Verificado en la documentación de Expo (SDK actual): `getExpoPushTokenAsync` **hace peticiones a servidores de Expo desde el teléfono** y exige proyecto EAS. En Cuba eso añade un segundo punto de fallo no verificado además de FCM. Este plan usa `getDevicePushTokenAsync` (token FCM nativo) y el backend envía **directo a FCM HTTP v1**: la prueba de §6.1 mide solo FCM. El canal se llama `fcm`. En iOS (Parte 2) el equivalente es APNs directo.

## Global Constraints

- Expo SDK **57** (`expo@~57.0.0`), expo-router 57, React Native 0.87. Instalar paquetes Expo con `npx expo install` (elige la versión compatible), nunca `npm i` a mano.
- `@oficio/shared`: sin DOM, sin React, sin `localStorage`, sin axios. Única dependencia de runtime: `zod`.
- Imports del paquete siempre como `@oficio/shared` (preparado para workspaces).
- Identidad: nombre visible **"Oficios Cuba"**, `android.package` / `ios.bundleIdentifier` **`com.dardoit.oficios`**, desarrollador **DARDOIT**, esquema `oficio`.
- API por defecto `https://oficio.dardoit.com/api`, configurable con `EXPO_PUBLIC_API_URL`.
- Token en `expo-secure-store`. Timeout de red 20 s.
- La notificación **no lleva el texto del mensaje**: "Nueva solicitud de {nombre}" / "Nuevo mensaje de {nombre}".
- El envío de push **nunca** bloquea ni rompe la respuesta de un mensaje.
- Tuteo, español neutro en toda la UI. Fuentes empaquetadas (sin descargas).
- Secretos (cuenta de servicio de Firebase, `google-services.json`) **fuera de git**: el repo es público. Archivos 600; nunca pegarlos en el chat.
- Cambios de red/exposición en vps2 (salida a internet de `oficio_api`) = **OK explícito de Dariel antes de desplegar**.
- Backend: seguir el patrón existente (rutas en `src/routes`, migraciones al final de `MIGRACIONES` en `src/db/index.ts` + `schema`, tests en `backend/test` con `helpers.ts`).
- Commits en español, con las líneas de atribución de la sesión.

## Review Focus

1. **Destinatario correcto del push:** `conversations.provider_id` es el id del **perfil**, no del usuario. Un aviso al proveedor debe resolver `provider_profiles.user_id`. Un error aquí manda el push al cliente o a nadie. → test en Tarea 5 ("el proveedor recibe la solicitud; el cliente no").
2. **El remitente no se notifica a sí mismo** cuando escribe desde dos dispositivos. → test en Tarea 5.
3. **Un token registrado por otro usuario** (teléfono prestado / cambio de cuenta): `UNIQUE(canal, token)` debe reasignar el token al nuevo usuario, no duplicarlo ni dejar que el anterior siga recibiendo. → test en Tarea 4.
4. **Canal caído o lento:** si FCM tarda o falla, `POST /messages` responde igual y rápido. → test en Tarea 5 con un canal que lanza.
5. **Cerrar sesión sin red:** el token FCM queda registrado al usuario anterior en el backend. La app debe intentar el `DELETE` y, si falla, reintentarlo en el siguiente arranque con red. → test en Tarea 9 (`pendientesDeBorrar`).

## Estructura de archivos

```
oficios-cuba/
├── shared/
│   ├── package.json, tsconfig.json, vitest.config.ts
│   └── src/{index.ts, tipos.ts, formato.ts, validacion.ts, api.ts}
│   └── test/{formato.test.ts, validacion.test.ts, api.test.ts}
├── backend/
│   ├── src/db/index.ts                 (mod: tabla push_devices + migración v3)
│   ├── src/push/{canal.ts, avisos.ts, fcm.ts, registro.ts}
│   ├── src/routes/push.ts              (nuevo)
│   ├── src/routes/conversations.ts     (mod: llamar a avisos)
│   ├── src/app.ts                      (mod: montar /api/push)
│   ├── src/scripts/push-prueba.ts      (nuevo: protocolo Cuba)
│   └── test/{push-dispositivos.test.ts, push-avisos.test.ts, push-fcm.test.ts}
├── mobile/
│   ├── package.json, app.config.ts, tsconfig.json, jest.config.js, babel/metro por defecto
│   ├── app/_layout.tsx, app/(tabs)/_layout.tsx, app/(tabs)/index.tsx, app/(tabs)/mensajes.tsx, app/(tabs)/cuenta.tsx
│   ├── app/servicio/[id].tsx, app/conversacion/[id].tsx, app/(auth)/entrar.tsx, app/(auth)/registro.tsx
│   ├── src/lib/{api.ts, sesion.ts, push.ts, tema.ts}
│   ├── src/componentes/{Boton.tsx, Campo.tsx, Pantalla.tsx, TarjetaServicio.tsx, Avisos.tsx}
│   └── test/{sesion.test.ts, push.test.ts}
└── docs/prueba-push-cuba.md            (protocolo §6.1)
```

---

### Task 1: Paquete `@oficio/shared` — tipos y formato

**Files:**
- Create: `oficios-cuba/shared/package.json`, `oficios-cuba/shared/tsconfig.json`, `oficios-cuba/shared/vitest.config.ts`
- Create: `oficios-cuba/shared/src/tipos.ts`, `oficios-cuba/shared/src/formato.ts`, `oficios-cuba/shared/src/index.ts`
- Test: `oficios-cuba/shared/test/formato.test.ts`

**Interfaces:**
- Produces: tipos `UserType, Plan, PriceType, User, Category, ServiceSummary, ServiceDetail, ProviderCard, Review, Conversation, Message, Pagination`; funciones `parseDate(v): Date`, `formatPrice(s): string`, `priceFrom(s): {prefix, amount, suffix}`, `relativeTime(v, ahora?): string`, `shortTime(v): string`, `initials(name): string`, `nombreVisible(p: {business_name?, owner_name}): string`, `whatsappLink(phone, text): string`.

- [ ] **Step 1: Crear el paquete**

`oficios-cuba/shared/package.json`:
```json
{
  "name": "@oficio/shared",
  "version": "0.1.0",
  "private": true,
  "main": "src/index.ts",
  "types": "src/index.ts",
  "scripts": { "test": "vitest run", "typecheck": "tsc --noEmit" },
  "dependencies": { "zod": "^3.23.8" },
  "devDependencies": { "typescript": "^5.4.5", "vitest": "^3" }
}
```

`oficios-cuba/shared/tsconfig.json` (sin `DOM` en `lib`: si algo usa `window`/`localStorage`, no compila):
```json
{
  "compilerOptions": {
    "target": "ES2022",
    "module": "ESNext",
    "moduleResolution": "Bundler",
    "lib": ["ES2022"],
    "strict": true,
    "noEmit": true,
    "skipLibCheck": true,
    "types": []
  },
  "include": ["src", "test"]
}
```

`oficios-cuba/shared/vitest.config.ts`:
```ts
import { defineConfig } from 'vitest/config';
export default defineConfig({ test: { environment: 'node' } });
```

Run: `cd oficios-cuba/shared && npm install --no-audit --no-fund`

- [ ] **Step 2: Test de formato (falla)**

`oficios-cuba/shared/test/formato.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { formatPrice, initials, nombreVisible, parseDate, priceFrom, relativeTime, whatsappLink } from '../src/formato';

describe('formato', () => {
  it('parseDate acepta el formato de SQLite (UTC sin zona) y el ISO', () => {
    expect(parseDate('2026-09-25 10:00:00').toISOString()).toBe('2026-09-25T10:00:00.000Z');
    expect(parseDate('2026-09-25T10:00:00.000Z').toISOString()).toBe('2026-09-25T10:00:00.000Z');
    expect(Number.isNaN(parseDate(null).getTime())).toBe(true);
  });

  it('formatPrice', () => {
    expect(formatPrice({ price_type: 'negotiable', price_min: 10 })).toBe('A convenir');
    expect(formatPrice({ price_type: 'fixed', price_min: null, price_max: null })).toBe('A convenir');
    expect(formatPrice({ price_type: 'hourly', price_min: 5 })).toBe('$5 / hora');
    expect(formatPrice({ price_type: 'fixed', price_min: 10, price_max: 25 })).toBe('$10 – $25');
  });

  it('priceFrom da "desde" solo con rango', () => {
    expect(priceFrom({ price_type: 'fixed', price_min: 10, price_max: 25 })).toEqual({ prefix: 'desde', amount: '$10', suffix: '' });
    expect(priceFrom({ price_type: 'daily', price_min: 60 })).toEqual({ prefix: '', amount: '$60', suffix: '/ día' });
  });

  it('relativeTime', () => {
    const ahora = new Date('2026-09-25T12:00:00Z');
    expect(relativeTime('2026-09-25T11:59:30Z', ahora)).toBe('ahora');
    expect(relativeTime('2026-09-25T11:15:00Z', ahora)).toBe('hace 45 min');
    expect(relativeTime('2026-09-24T12:00:00Z', ahora)).toBe('ayer');
  });

  it('nombreVisible e initials', () => {
    expect(nombreVisible({ business_name: null, owner_name: 'Laura Méndez' })).toBe('Laura Méndez');
    expect(nombreVisible({ business_name: 'ElectroHogar', owner_name: 'X' })).toBe('ElectroHogar');
    expect(initials('Laura Méndez')).toBe('LM');
    expect(initials('')).toBe('?');
  });

  it('whatsappLink limpia el número', () => {
    expect(whatsappLink('+53 5 123-4567', 'hola')).toBe('https://wa.me/5351234567?text=hola');
  });
});
```

Run: `cd oficios-cuba/shared && npx vitest run` → Expected: FAIL (no existe `../src/formato`).

- [ ] **Step 3: Implementar `tipos.ts`, `formato.ts`, `index.ts`**

`oficios-cuba/shared/src/tipos.ts` — copiar de `oficios-cuba/frontend/src/types/index.ts` **las interfaces** `UserType, Plan, PriceType, User, Province, Municipality, Category, CategoryStat, SiteStats, ServiceSummary, ServiceDetail, ProviderCard, ProviderPublic, ProviderServiceItem, Review, Conversation, Message, Favorite, Pagination, PlanInfo`, con estos ajustes a la API actual (verificados en el backend tras `ab97f00`):
- `ServiceDetail` y `ProviderPublic`: **quitar `lat` y `lng`** (ya no se devuelven).
- `Review.service_title?: string | null` (las reseñas de servicios borrados lo traen en `null`).
- Añadir al final:
```ts
export interface PaginaServicios { services: ServiceSummary[]; pagination: Pagination }
export interface SesionUsuario { token: string; user: User }
export type CanalPush = 'fcm';
export interface DispositivoPush { canal: CanalPush; token: string; plataforma: 'android' | 'ios'; app_version: string }
```

`oficios-cuba/shared/src/formato.ts`:
```ts
import type { PriceType } from './tipos';

type ConPrecio = { price_min?: number | null; price_max?: number | null; price_type: PriceType };

// SQLite guarda algunas fechas como "YYYY-MM-DD HH:MM:SS" (UTC, sin zona): se normalizan a ISO.
export function parseDate(value: string | null | undefined): Date {
  if (!value) return new Date(NaN);
  const iso = /[zZ]|[+-]\d\d:?\d\d$/.test(value) ? value : `${value.replace(' ', 'T')}Z`;
  return new Date(iso);
}

// Hermes (motor JS de React Native) no garantiza Intl completo en Android: formateo manual.
function dinero(n: number) {
  const [ent, dec] = (Math.round(n * 100) / 100).toString().split('.');
  const miles = ent.replace(/\B(?=(\d{3})+(?!\d))/g, '.');
  return `$${dec ? `${miles},${dec.padEnd(2, '0')}` : miles}`;
}

const unidad: Record<PriceType, string> = { fixed: '', hourly: ' / hora', daily: ' / día', negotiable: '' };

export function formatPrice({ price_min: min, price_max: max, price_type }: ConPrecio): string {
  if (price_type === 'negotiable' || (min == null && max == null)) return 'A convenir';
  if (min != null && max != null && min !== max) return `${dinero(min)} – ${dinero(max)}${unidad[price_type]}`;
  return `${dinero((min ?? max) as number)}${unidad[price_type]}`;
}

export function priceFrom({ price_min: min, price_max: max, price_type }: ConPrecio) {
  if (price_type === 'negotiable' || (min == null && max == null)) return { prefix: '', amount: 'A convenir', suffix: '' };
  const rango = min != null && max != null && min !== max;
  return { prefix: rango ? 'desde' : '', amount: dinero((min ?? max) as number), suffix: unidad[price_type].trim() };
}

export function relativeTime(value: string, ahora: Date = new Date()): string {
  const fecha = parseDate(value);
  const s = (ahora.getTime() - fecha.getTime()) / 1000;
  if (s < 60) return 'ahora';
  if (s < 3600) return `hace ${Math.floor(s / 60)} min`;
  if (s < 86400) return `hace ${Math.floor(s / 3600)} h`;
  if (s < 86400 * 7) {
    const d = Math.floor(s / 86400);
    return d === 1 ? 'ayer' : `hace ${d} días`;
  }
  const meses = ['ene', 'feb', 'mar', 'abr', 'may', 'jun', 'jul', 'ago', 'sept', 'oct', 'nov', 'dic'];
  const año = fecha.getUTCFullYear() === ahora.getUTCFullYear() ? '' : ` ${fecha.getUTCFullYear()}`;
  return `${fecha.getUTCDate()} ${meses[fecha.getUTCMonth()]}${año}`;
}

export function shortTime(value: string): string {
  const d = parseDate(value);
  return `${String(d.getHours()).padStart(2, '0')}:${String(d.getMinutes()).padStart(2, '0')}`;
}

export function initials(name: string | null | undefined): string {
  if (!name) return '?';
  const partes = name.replace(/[^\p{L}\s]/gu, ' ').trim().split(/\s+/).filter(Boolean);
  return ((partes[0]?.[0] ?? '') + (partes.length > 1 ? partes[partes.length - 1][0] : '')).toUpperCase() || '?';
}

export const nombreVisible = (p: { business_name?: string | null; owner_name: string }) => p.business_name || p.owner_name;

export function whatsappLink(phone: string, text: string) {
  return `https://wa.me/${phone.replace(/\D/g, '')}?text=${encodeURIComponent(text)}`;
}
```

`oficios-cuba/shared/src/index.ts`:
```ts
export * from './tipos';
export * from './formato';
```

- [ ] **Step 4: Pasan los tests y el typecheck**

Run: `cd oficios-cuba/shared && npx vitest run && npx tsc --noEmit` → Expected: PASS, sin errores.

- [ ] **Step 5: Commit**

```bash
cd ~/Documentos/dev/oficio && git add oficios-cuba/shared && git commit -m "shared: paquete @oficio/shared con tipos y formato"
```

---

### Task 2: `@oficio/shared` — validación y cliente de la API

**Files:**
- Create: `oficios-cuba/shared/src/validacion.ts`, `oficios-cuba/shared/src/api.ts`
- Modify: `oficios-cuba/shared/src/index.ts`
- Test: `oficios-cuba/shared/test/validacion.test.ts`, `oficios-cuba/shared/test/api.test.ts`

**Interfaces:**
- Consumes: tipos de Task 1.
- Produces:
  - `esquemaRegistro`, `esquemaLogin`, `esquemaMensaje` (zod).
  - `class ErrorApi extends Error { status: number }` — `status 0` = sin red o timeout.
  - `crearCliente(opts: { baseUrl: string; getToken: () => Promise<string | null> | string | null; onUnauthorized?: () => void; timeoutMs?: number; fetchImpl?: typeof fetch })` que devuelve:
    - `auth.login({email,password}): Promise<SesionUsuario>`, `auth.register(datos): Promise<SesionUsuario>`, `auth.me(): Promise<{ user: User }>`
    - `servicios.listar(params?: Record<string,string|number|undefined>): Promise<PaginaServicios>`, `servicios.detalle(id): Promise<{ service: ServiceDetail; reviews: Review[]; related: ServiceSummary[] }>`
    - `conversaciones.listar(): Promise<{ conversations: Conversation[] }>`, `conversaciones.noLeidos(): Promise<{ count: number }>`, `conversaciones.detalle(id, after?): Promise<{ conversation: Conversation; messages: Message[] }>`, `conversaciones.crear({provider_id, service_id?, initial_message}): Promise<{ conversation: { id: string } }>`, `conversaciones.enviar(id, content): Promise<{ message: Message }>`
    - `push.registrar(d: DispositivoPush): Promise<void>`, `push.borrar(token: string): Promise<void>`

- [ ] **Step 1: Tests (fallan)**

`oficios-cuba/shared/test/validacion.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { esquemaLogin, esquemaMensaje, esquemaRegistro } from '../src/validacion';

describe('validación (mismas reglas que backend/src/routes/auth.ts)', () => {
  it('registro', () => {
    const ok = { email: ' Ana@X.cu ', password: '12345678', full_name: 'Ana Pérez', user_type: 'client' };
    expect(esquemaRegistro.parse(ok).email).toBe('ana@x.cu');
    expect(esquemaRegistro.safeParse({ ...ok, password: 'corta' }).success).toBe(false);
    expect(esquemaRegistro.safeParse({ ...ok, user_type: 'admin' }).success).toBe(false);
    expect(esquemaRegistro.safeParse({ ...ok, phone: 'abc' }).success).toBe(false);
  });
  it('login y mensaje', () => {
    expect(esquemaLogin.safeParse({ email: 'a@b.cu', password: '' }).success).toBe(false);
    expect(esquemaMensaje.safeParse({ content: '   ' }).success).toBe(false);
    expect(esquemaMensaje.safeParse({ content: 'x'.repeat(2001) }).success).toBe(false);
  });
});
```

`oficios-cuba/shared/test/api.test.ts`:
```ts
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
    const fetchImpl = vi.fn(() => respuesta(200, { services: [], pagination: {} }));
    const api = crearCliente({ baseUrl: 'https://x/api', getToken: () => null, fetchImpl });
    await api.servicios.listar({ sort: 'newest', q: '', province_id: undefined, page: 2 });
    expect(fetchImpl.mock.calls[0][0]).toBe('https://x/api/services?sort=newest&page=2');
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
```

Run: `cd oficios-cuba/shared && npx vitest run` → Expected: FAIL (módulos inexistentes).

- [ ] **Step 2: Implementar**

`oficios-cuba/shared/src/validacion.ts`:
```ts
import { z } from 'zod';

// Copia de las reglas de backend/src/routes/auth.ts y conversations.ts: el formulario avisa antes de ir a la red.
export const esquemaRegistro = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
  password: z.string().min(8, 'La contraseña debe tener al menos 8 caracteres').max(128),
  full_name: z.string().trim().min(2, 'Escribe tu nombre completo').max(80),
  phone: z.string().trim().regex(/^\+?[\d\s-]{8,20}$/, 'Usa solo números, por ejemplo +53 5 123 4567').optional(),
  user_type: z.enum(['client', 'provider']),
});

export const esquemaLogin = z.object({
  email: z.string().trim().toLowerCase().email('Email inválido'),
  password: z.string().min(1, 'Contraseña requerida'),
});

export const esquemaMensaje = z.object({ content: z.string().trim().min(1, 'Escribe un mensaje').max(2000) });

export type DatosRegistro = z.infer<typeof esquemaRegistro>;
export type DatosLogin = z.infer<typeof esquemaLogin>;
```

`oficios-cuba/shared/src/api.ts`:
```ts
import type { Conversation, DispositivoPush, Message, PaginaServicios, Review, ServiceDetail, ServiceSummary, SesionUsuario, User } from './tipos';
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

export function crearCliente({ baseUrl, getToken, onUnauthorized, timeoutMs = 20000, fetchImpl = fetch }: OpcionesCliente) {
  async function pedir<T>(metodo: string, ruta: string, cuerpo?: unknown, query?: Query): Promise<T> {
    const qs = query
      ? Object.entries(query).filter(([, v]) => v !== undefined && v !== '').map(([k, v]) => `${encodeURIComponent(k)}=${encodeURIComponent(String(v))}`).join('&')
      : '';
    const token = await getToken();
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
```

`oficios-cuba/shared/src/index.ts`:
```ts
export * from './tipos';
export * from './formato';
export * from './validacion';
export * from './api';
```

- [ ] **Step 3: Pasan**

Run: `cd oficios-cuba/shared && npx vitest run && npx tsc --noEmit` → Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd ~/Documentos/dev/oficio && git add oficios-cuba/shared && git commit -m "shared: validación zod y cliente de la API sobre fetch"
```

---

### Task 3: Esqueleto de la app Expo con `@oficio/shared` enlazado

**Files:**
- Create: `oficios-cuba/mobile/` (plantilla Expo), `oficios-cuba/mobile/app.config.ts`, `oficios-cuba/mobile/src/lib/tema.ts`, `oficios-cuba/mobile/src/lib/api.ts`, `oficios-cuba/mobile/src/componentes/{Pantalla.tsx,Boton.tsx,Campo.tsx}`
- Create: `oficios-cuba/mobile/app/_layout.tsx`, `oficios-cuba/mobile/app/(tabs)/_layout.tsx`, `oficios-cuba/mobile/app/(tabs)/index.tsx`, `oficios-cuba/mobile/app/(tabs)/mensajes.tsx`, `oficios-cuba/mobile/app/(tabs)/cuenta.tsx`
- Modify: `oficios-cuba/.gitignore` (añadir `mobile/android/`, `mobile/ios/`, `mobile/google-services.json`, `mobile/.expo/`)

**Interfaces:**
- Consumes: `crearCliente`, tipos de `@oficio/shared`.
- Produces: `tema` (`colores`, `fuentes`, `espacio`); `configApi = { baseUrl: string }` en `src/lib/api.ts`; componentes `<Pantalla titulo? scroll?>`, `<Boton titulo onPress variante? cargando? deshabilitado?>`, `<Campo etiqueta error? {...TextInputProps}>`.

- [ ] **Step 1: Crear el proyecto**

```bash
cd ~/Documentos/dev/oficio/oficios-cuba
npx create-expo-app@latest mobile --template default@sdk-57 --no-install
cd mobile && npm install --no-audit --no-fund
npm run reset-project   # deja app/ vacío con un index mínimo; responder "n" a mover el ejemplo a app-example
npm install --save file:../shared
npx expo install expo-secure-store expo-notifications expo-device expo-constants @tanstack/react-query expo-font @expo-google-fonts/bricolage-grotesque @expo-google-fonts/figtree
```

Si `create-expo-app` o `reset-project` no existen con ese nombre en SDK 57, leer `npx create-expo-app@latest --help` y usar la plantilla por defecto con expo-router; **no** cambiar a otra plantilla sin router.

Verificar: `cat package.json | grep -E '"expo"|"@oficio/shared"'` → `"expo": "~57...."` y `"@oficio/shared": "file:../shared"`.

- [ ] **Step 2: Configuración de la app**

Borrar `app.json` si existe y crear `oficios-cuba/mobile/app.config.ts`:
```ts
import type { ExpoConfig } from 'expo/config';

const config: ExpoConfig = {
  name: 'Oficios Cuba',
  slug: 'oficios-cuba',
  scheme: 'oficio',
  version: '0.1.0',
  orientation: 'portrait',
  userInterfaceStyle: 'light',
  android: {
    package: 'com.dardoit.oficios',
    // Fuera de git (repo público): lo aporta Dariel/Doniet desde la consola de Firebase (Task 7).
    googleServicesFile: process.env.GOOGLE_SERVICES_JSON ?? './google-services.json',
    permissions: ['POST_NOTIFICATIONS'],
  },
  ios: { bundleIdentifier: 'com.dardoit.oficios' },
  plugins: ['expo-router', 'expo-secure-store', ['expo-notifications', { defaultChannel: 'mensajes' }]],
  experiments: { typedRoutes: true },
};

export default config;
```

- [ ] **Step 3: Tema, cliente y componentes base**

`oficios-cuba/mobile/src/lib/tema.ts` (colores de `frontend/tailwind.config.js`; revisar ese archivo y copiar los hex exactos de `sand`, `ink`, `sea` y el acento coral si difieren de estos):
```ts
export const colores = {
  fondo: '#faf6f0', superficie: '#ffffff', borde: '#ece3d6',
  tinta: '#16213a', tintaSuave: '#5b6478', tintaTenue: '#8b93a5',
  acento: '#d9542b', acentoTexto: '#ffffff', mar: '#0f766e', error: '#b42318',
};
export const fuentes = { titulo: 'BricolageGrotesque_700Bold', texto: 'Figtree_400Regular', textoFuerte: 'Figtree_600SemiBold' };
export const espacio = (n: number) => n * 4;
```

`oficios-cuba/mobile/src/lib/api.ts` (la sesión se conecta en Task 8):
```ts
export const configApi = { baseUrl: process.env.EXPO_PUBLIC_API_URL ?? 'https://oficio.dardoit.com/api' };
// Las imágenes vienen como rutas relativas del sitio (/api/uploads/..., /demo/...).
export const urlImagen = (ruta?: string | null) =>
  !ruta ? undefined : ruta.startsWith('http') ? ruta : `${configApi.baseUrl.replace(/\/api$/, '')}${ruta}`;
```

`oficios-cuba/mobile/src/componentes/Pantalla.tsx`:
```tsx
import { ReactNode } from 'react';
import { ScrollView, StyleSheet, Text, View } from 'react-native';
import { SafeAreaView } from 'react-native-safe-area-context';
import { colores, espacio, fuentes } from '../lib/tema';

export function Pantalla({ titulo, scroll = true, children }: { titulo?: string; scroll?: boolean; children: ReactNode }) {
  const cuerpo = (
    <>
      {titulo ? <Text style={s.titulo}>{titulo}</Text> : null}
      {children}
    </>
  );
  return (
    <SafeAreaView style={s.raiz} edges={['top']}>
      {scroll ? <ScrollView contentContainerStyle={s.contenido} keyboardShouldPersistTaps="handled">{cuerpo}</ScrollView> : <View style={[s.contenido, { flex: 1 }]}>{cuerpo}</View>}
    </SafeAreaView>
  );
}

const s = StyleSheet.create({
  raiz: { flex: 1, backgroundColor: colores.fondo },
  contenido: { padding: espacio(4), gap: espacio(3) },
  titulo: { fontFamily: fuentes.titulo, fontSize: 28, color: colores.tinta },
});
```

`oficios-cuba/mobile/src/componentes/Boton.tsx`:
```tsx
import { ActivityIndicator, Pressable, StyleSheet, Text } from 'react-native';
import { colores, espacio, fuentes } from '../lib/tema';

type Props = { titulo: string; onPress: () => void; variante?: 'primario' | 'secundario'; cargando?: boolean; deshabilitado?: boolean };

export function Boton({ titulo, onPress, variante = 'primario', cargando, deshabilitado }: Props) {
  const primario = variante === 'primario';
  return (
    <Pressable
      accessibilityRole="button"
      onPress={onPress}
      disabled={deshabilitado || cargando}
      style={({ pressed }) => [s.base, primario ? s.primario : s.secundario, (pressed || deshabilitado) && { opacity: 0.6 }]}
    >
      {cargando ? <ActivityIndicator color={primario ? colores.acentoTexto : colores.tinta} /> : <Text style={[s.texto, { color: primario ? colores.acentoTexto : colores.tinta }]}>{titulo}</Text>}
    </Pressable>
  );
}

const s = StyleSheet.create({
  base: { minHeight: 48, borderRadius: 12, alignItems: 'center', justifyContent: 'center', paddingHorizontal: espacio(4) },
  primario: { backgroundColor: colores.acento },
  secundario: { backgroundColor: colores.superficie, borderWidth: 1, borderColor: colores.borde },
  texto: { fontFamily: fuentes.textoFuerte, fontSize: 16 },
});
```

`oficios-cuba/mobile/src/componentes/Campo.tsx`:
```tsx
import { StyleSheet, Text, TextInput, TextInputProps, View } from 'react-native';
import { colores, espacio, fuentes } from '../lib/tema';

export function Campo({ etiqueta, error, ...props }: TextInputProps & { etiqueta: string; error?: string }) {
  return (
    <View style={{ gap: espacio(1) }}>
      <Text style={s.etiqueta}>{etiqueta}</Text>
      <TextInput placeholderTextColor={colores.tintaTenue} {...props} style={[s.input, error && { borderColor: colores.error }]} accessibilityLabel={etiqueta} />
      {error ? <Text style={s.error}>{error}</Text> : null}
    </View>
  );
}

const s = StyleSheet.create({
  etiqueta: { fontFamily: fuentes.textoFuerte, color: colores.tinta },
  input: { minHeight: 48, borderWidth: 1, borderColor: colores.borde, borderRadius: 12, paddingHorizontal: espacio(3), backgroundColor: colores.superficie, fontFamily: fuentes.texto, fontSize: 16, color: colores.tinta },
  error: { color: colores.error, fontFamily: fuentes.texto },
});
```

- [ ] **Step 4: Layout raíz y pestañas provisionales**

`oficios-cuba/mobile/app/_layout.tsx`:
```tsx
import { BricolageGrotesque_700Bold } from '@expo-google-fonts/bricolage-grotesque';
import { Figtree_400Regular, Figtree_600SemiBold } from '@expo-google-fonts/figtree';
import { useFonts } from 'expo-font';
import { Stack } from 'expo-router';
import { QueryClient, QueryClientProvider } from '@tanstack/react-query';

const queryClient = new QueryClient({ defaultOptions: { queries: { retry: 2, staleTime: 30_000 } } });

export default function Raiz() {
  // Las fuentes vienen empaquetadas en node_modules: no se descargan en el teléfono.
  const [listas] = useFonts({ BricolageGrotesque_700Bold, Figtree_400Regular, Figtree_600SemiBold });
  if (!listas) return null;
  return (
    <QueryClientProvider client={queryClient}>
      <Stack screenOptions={{ headerTitleStyle: { fontFamily: 'Figtree_600SemiBold' } }}>
        <Stack.Screen name="(tabs)" options={{ headerShown: false }} />
      </Stack>
    </QueryClientProvider>
  );
}
```

`oficios-cuba/mobile/app/(tabs)/_layout.tsx`:
```tsx
import { Tabs } from 'expo-router';
import { colores } from '../../src/lib/tema';

export default function Pestañas() {
  return (
    <Tabs screenOptions={{ headerShown: false, tabBarActiveTintColor: colores.acento }}>
      <Tabs.Screen name="index" options={{ title: 'Inicio' }} />
      <Tabs.Screen name="mensajes" options={{ title: 'Mensajes' }} />
      <Tabs.Screen name="cuenta" options={{ title: 'Cuenta' }} />
    </Tabs>
  );
}
```

`oficios-cuba/mobile/app/(tabs)/index.tsx`, `mensajes.tsx`, `cuenta.tsx` — provisionales (se reemplazan en Tasks 8–9):
```tsx
import { Text } from 'react-native';
import { Pantalla } from '../../src/componentes/Pantalla';
import { formatPrice } from '@oficio/shared';

export default function Inicio() {
  return <Pantalla titulo="Oficios Cuba"><Text>{formatPrice({ price_type: 'hourly', price_min: 5 })}</Text></Pantalla>;
}
```
(`mensajes.tsx` y `cuenta.tsx`: igual, con `titulo="Mensajes"` / `"Cuenta"` y sin el `Text` de precio.)

- [ ] **Step 5: Verificar que Metro resuelve `@oficio/shared` y que compila**

```bash
cd ~/Documentos/dev/oficio/oficios-cuba/mobile
npx tsc --noEmit
npx expo export --platform android --output-dir /tmp/oficio-export && ls /tmp/oficio-export/_expo/static/js/android/ | head
grep -l "A convenir\|/ hora" -r /tmp/oficio-export/_expo/static/js/android/ | head -1
```
Expected: tsc sin errores; el export termina y el bundle contiene el texto de `formatPrice` (prueba de que `file:../shared` entra en el bundle). **Si Metro no resuelve el paquete**, consultar la guía de monorepos de Expo (context7 `/websites/expo_dev`, "monorepos") antes de tocar `metro.config.js`: desde SDK 52 la configuración es automática y la guía pide quitar `watchFolders` manuales.

- [ ] **Step 6: Commit**

```bash
cd ~/Documentos/dev/oficio && printf 'mobile/android/\nmobile/ios/\nmobile/.expo/\nmobile/google-services.json\n' >> oficios-cuba/.gitignore
git add oficios-cuba/.gitignore oficios-cuba/mobile && git commit -m "mobile: esqueleto Expo SDK 57 con expo-router y @oficio/shared"
```

---

### Task 4: Backend — dispositivos push (migración v3 + endpoints)

**Files:**
- Modify: `oficios-cuba/backend/src/db/index.ts` (tabla en `schema` + migración 3)
- Create: `oficios-cuba/backend/src/push/registro.ts`, `oficios-cuba/backend/src/routes/push.ts`
- Modify: `oficios-cuba/backend/src/app.ts` (montar `/api/push`)
- Test: `oficios-cuba/backend/test/push-dispositivos.test.ts`; modify `oficios-cuba/backend/test/migraciones.test.ts`

**Interfaces:**
- Produces: `registrarDispositivo(userId, d: { canal: 'fcm'; token; plataforma: 'android'|'ios'; app_version })`, `borrarDispositivo(userId, token)`, `dispositivosDe(userId): { canal: 'fcm'; token: string }[]`, `borrarToken(canal, token)`; rutas `POST /api/push/devices` (201) y `DELETE /api/push/devices/:token` (200).

- [ ] **Step 1: Test (falla)**

`oficios-cuba/backend/test/push-dispositivos.test.ts`:
```ts
import { describe, expect, it } from 'vitest';
import { api, db, registrar } from './helpers.js';
import { dispositivosDe } from '../src/push/registro.js';

const dispositivo = (token: string) => ({ canal: 'fcm', token, plataforma: 'android', app_version: '0.1.0' });

describe('dispositivos push', () => {
  it('registra y es idempotente', async () => {
    const u = await registrar('client');
    expect((await api.post('/api/push/devices').set(u.auth).send(dispositivo('tok-a'))).status).toBe(201);
    expect((await api.post('/api/push/devices').set(u.auth).send(dispositivo('tok-a'))).status).toBe(201);
    expect(dispositivosDe(u.userId)).toEqual([{ canal: 'fcm', token: 'tok-a' }]);
  });

  it('un token que pasa a otra cuenta deja de pertenecer a la anterior', async () => {
    const a = await registrar('client');
    const b = await registrar('provider');
    await api.post('/api/push/devices').set(a.auth).send(dispositivo('tok-compartido'));
    await api.post('/api/push/devices').set(b.auth).send(dispositivo('tok-compartido'));
    expect(dispositivosDe(a.userId)).toEqual([]);
    expect(dispositivosDe(b.userId)).toEqual([{ canal: 'fcm', token: 'tok-compartido' }]);
  });

  it('borrar solo quita el token propio', async () => {
    const a = await registrar('client');
    const b = await registrar('client');
    await api.post('/api/push/devices').set(a.auth).send(dispositivo('tok-de-a'));
    expect((await api.delete('/api/push/devices/tok-de-a').set(b.auth)).status).toBe(200);
    expect(dispositivosDe(a.userId)).toHaveLength(1);
    await api.delete('/api/push/devices/tok-de-a').set(a.auth);
    expect(dispositivosDe(a.userId)).toHaveLength(0);
  });

  it('valida la entrada y exige sesión', async () => {
    const u = await registrar('client');
    expect((await api.post('/api/push/devices').send(dispositivo('x'))).status).toBe(401);
    expect((await api.post('/api/push/devices').set(u.auth).send({ ...dispositivo('x'), canal: 'sms' })).status).toBe(400);
    expect((await api.post('/api/push/devices').set(u.auth).send({ ...dispositivo('') })).status).toBe(400);
  });

  it('al borrar el usuario se borran sus dispositivos', async () => {
    const u = await registrar('client');
    await api.post('/api/push/devices').set(u.auth).send(dispositivo('tok-borrado'));
    db.prepare('DELETE FROM users WHERE id = ?').run(u.userId);
    expect(db.prepare("SELECT COUNT(*) AS n FROM push_devices WHERE token = 'tok-borrado'").get()).toEqual({ n: 0 });
  });
});
```

En `oficios-cuba/backend/test/migraciones.test.ts`, dentro del `it`, después de la aserción de `password_changed_at`, añadir:
```ts
    const tablas = (db.prepare("SELECT name FROM sqlite_master WHERE type = 'table'").all() as { name: string }[]).map((t) => t.name);
    expect(tablas).toContain('push_devices');
```

Run: `cd oficios-cuba/backend && npx vitest run test/push-dispositivos.test.ts test/migraciones.test.ts` → Expected: FAIL.

- [ ] **Step 2: Esquema y migración**

En `oficios-cuba/backend/src/db/index.ts`, en `schema`, antes de `-- Indexes`:
```sql
-- Dispositivos para notificaciones push (un token pertenece a un solo usuario)
CREATE TABLE IF NOT EXISTS push_devices (
  id TEXT PRIMARY KEY,
  user_id TEXT NOT NULL,
  canal TEXT NOT NULL CHECK (canal IN ('fcm')),
  token TEXT NOT NULL,
  plataforma TEXT NOT NULL CHECK (plataforma IN ('android', 'ios')),
  app_version TEXT,
  created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
  FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
  UNIQUE (canal, token)
);
```
y en los índices: `CREATE INDEX IF NOT EXISTS idx_push_devices_user ON push_devices(user_id);`

Al final de `MIGRACIONES`:
```ts
  // 3 — push_devices. La tabla es nueva: basta con crearla (mismo SQL que en `schema`).
  (d) => {
    d.exec(`
      CREATE TABLE IF NOT EXISTS push_devices (
        id TEXT PRIMARY KEY,
        user_id TEXT NOT NULL,
        canal TEXT NOT NULL CHECK (canal IN ('fcm')),
        token TEXT NOT NULL,
        plataforma TEXT NOT NULL CHECK (plataforma IN ('android', 'ios')),
        app_version TEXT,
        created_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        last_seen_at DATETIME DEFAULT CURRENT_TIMESTAMP,
        FOREIGN KEY (user_id) REFERENCES users(id) ON DELETE CASCADE,
        UNIQUE (canal, token)
      );
      CREATE INDEX IF NOT EXISTS idx_push_devices_user ON push_devices(user_id);
    `);
  },
```

- [ ] **Step 3: Registro y rutas**

`oficios-cuba/backend/src/push/registro.ts`:
```ts
import { v4 as uuidv4 } from 'uuid';
import db from '../db/index.js';

export type Canal = 'fcm';

export function registrarDispositivo(userId: string, d: { canal: Canal; token: string; plataforma: 'android' | 'ios'; app_version: string }) {
  const ahora = new Date().toISOString();
  // Si el token era de otra cuenta (teléfono prestado, cambio de sesión), pasa a esta.
  db.prepare(`
    INSERT INTO push_devices (id, user_id, canal, token, plataforma, app_version, created_at, last_seen_at)
    VALUES (?, ?, ?, ?, ?, ?, ?, ?)
    ON CONFLICT (canal, token) DO UPDATE SET user_id = excluded.user_id, plataforma = excluded.plataforma,
      app_version = excluded.app_version, last_seen_at = excluded.last_seen_at
  `).run(uuidv4(), userId, d.canal, d.token, d.plataforma, d.app_version, ahora, ahora);
}

export function borrarDispositivo(userId: string, token: string) {
  db.prepare('DELETE FROM push_devices WHERE user_id = ? AND token = ?').run(userId, token);
}

export function borrarToken(canal: Canal, token: string) {
  db.prepare('DELETE FROM push_devices WHERE canal = ? AND token = ?').run(canal, token);
}

export function dispositivosDe(userId: string): { canal: Canal; token: string }[] {
  return db.prepare('SELECT canal, token FROM push_devices WHERE user_id = ? ORDER BY created_at').all(userId) as { canal: Canal; token: string }[];
}
```

`oficios-cuba/backend/src/routes/push.ts`:
```ts
import { Router } from 'express';
import { z } from 'zod';
import { authMiddleware, AuthRequest } from '../middleware/auth.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { borrarDispositivo, registrarDispositivo } from '../push/registro.js';

const router = Router();
router.use(authMiddleware);

router.post('/devices', asyncHandler(async (req: AuthRequest, res) => {
  const d = z.object({
    canal: z.enum(['fcm']),
    token: z.string().trim().min(1).max(4096),
    plataforma: z.enum(['android', 'ios']),
    app_version: z.string().trim().max(20).default(''),
  }).parse(req.body);
  registrarDispositivo(req.user!.id, d);
  res.status(201).json({ ok: true });
}));

router.delete('/devices/:token', asyncHandler(async (req: AuthRequest, res) => {
  borrarDispositivo(req.user!.id, req.params.token);
  res.json({ ok: true });
}));

export default router;
```

En `oficios-cuba/backend/src/app.ts`: `import pushRoutes from './routes/push.js';` y, junto a las demás, `app.use('/api/push', pushRoutes);`

- [ ] **Step 4: Pasan todos los tests del backend**

Run: `cd oficios-cuba/backend && npx vitest run && npm run typecheck` → Expected: todo PASS (los 24 anteriores + los nuevos).

- [ ] **Step 5: Mutación rápida**

Cambiar temporalmente `ON CONFLICT ... DO UPDATE SET user_id = excluded.user_id` por `DO NOTHING` y correr `npx vitest run test/push-dispositivos.test.ts` → debe FALLAR el test "un token que pasa a otra cuenta". Restaurar.

- [ ] **Step 6: Commit**

```bash
cd ~/Documentos/dev/oficio && git add oficios-cuba/backend && git commit -m "backend: dispositivos push (migración v3, POST/DELETE /api/push/devices)"
```

---

### Task 5: Backend — avisos de solicitud y mensaje (canal intercambiable)

**Files:**
- Create: `oficios-cuba/backend/src/push/canal.ts`, `oficios-cuba/backend/src/push/avisos.ts`
- Modify: `oficios-cuba/backend/src/routes/conversations.ts` (POST `/` y POST `/:id/messages`)
- Test: `oficios-cuba/backend/test/push-avisos.test.ts`

**Interfaces:**
- Consumes: `dispositivosDe`, `borrarToken` (Task 4).
- Produces:
  - `interface Notificacion { titulo: string; cuerpo: string; datos: Record<string, string> }`
  - `type ResultadoEnvio = 'ok' | 'token_invalido' | 'error'`
  - `interface CanalPush { enviar(token: string, n: Notificacion): Promise<ResultadoEnvio> }`
  - `usarCanal(canal: 'fcm', impl: CanalPush | null)` (tests y arranque), `avisarUsuario(userId, n): Promise<void>`, `avisarNuevaSolicitud(conversationId)`, `avisarNuevoMensaje(conversationId, senderType)` — las dos últimas **no devuelven promesa** (disparan y olvidan).
  - `esperarAvisosPendientes(): Promise<void>` (solo para tests).

- [ ] **Step 1: Test (falla)**

`oficios-cuba/backend/test/push-avisos.test.ts`:
```ts
import { afterEach, describe, expect, it } from 'vitest';
import { api, crearServicio, db, ponerPlan, registrar } from './helpers.js';
import { CanalPush, esperarAvisosPendientes, Notificacion, usarCanal } from '../src/push/avisos.js';

function canalFalso(respuesta: 'ok' | 'token_invalido' | 'lanza' | 'lento' = 'ok') {
  const enviados: { token: string; n: Notificacion }[] = [];
  const canal: CanalPush = {
    async enviar(token, n) {
      enviados.push({ token, n });
      if (respuesta === 'lanza') throw new Error('FCM caído');
      if (respuesta === 'lento') await new Promise((r) => setTimeout(r, 3000));
      return respuesta === 'token_invalido' ? 'token_invalido' : 'ok';
    },
  };
  return { canal, enviados };
}

async function escenario() {
  const pro = await registrar('provider');
  const cli = await registrar('client');
  ponerPlan(pro.providerId!, 'pro');
  const servicio = (await crearServicio(pro.auth, { title: 'Arreglo de neveras' })).body.service.id as string;
  await api.post('/api/push/devices').set(pro.auth).send({ canal: 'fcm', token: `tok-pro-${pro.userId}`, plataforma: 'android', app_version: '0.1.0' });
  await api.post('/api/push/devices').set(cli.auth).send({ canal: 'fcm', token: `tok-cli-${cli.userId}`, plataforma: 'android', app_version: '0.1.0' });
  return { pro, cli, servicio };
}

afterEach(() => usarCanal('fcm', null));

describe('avisos push', () => {
  it('una solicitud nueva avisa al PROVEEDOR (su usuario, no su perfil) y no al cliente', async () => {
    const f = canalFalso();
    usarCanal('fcm', f.canal);
    const { pro, cli, servicio } = await escenario();
    const res = await api.post('/api/conversations').set(cli.auth).send({ provider_id: pro.providerId, service_id: servicio, initial_message: 'Mi nevera no enfría' });
    expect(res.status).toBe(201);
    await esperarAvisosPendientes();

    expect(f.enviados).toHaveLength(1);
    expect(f.enviados[0].token).toBe(`tok-pro-${pro.userId}`);
    expect(f.enviados[0].n.titulo).toMatch(/^Nueva solicitud de /);
    expect(f.enviados[0].n.datos).toEqual({ tipo: 'mensaje', conversation_id: res.body.conversation.id });
    // Nunca el texto del mensaje.
    expect(JSON.stringify(f.enviados[0].n)).not.toContain('nevera no enfría');
  });

  it('un mensaje del proveedor avisa al cliente y no al proveedor', async () => {
    const { pro, cli, servicio } = await escenario();
    const conv = (await api.post('/api/conversations').set(cli.auth).send({ provider_id: pro.providerId, service_id: servicio, initial_message: 'hola' })).body.conversation.id;
    await esperarAvisosPendientes();
    const f = canalFalso();
    usarCanal('fcm', f.canal);
    await api.post(`/api/conversations/${conv}/messages`).set(pro.auth).send({ content: 'Paso mañana a las 10' });
    await esperarAvisosPendientes();
    expect(f.enviados.map((e) => e.token)).toEqual([`tok-cli-${cli.userId}`]);
    expect(f.enviados[0].n.titulo).toMatch(/^Nuevo mensaje de /);
    expect(JSON.stringify(f.enviados[0].n)).not.toContain('mañana');
  });

  it('una segunda conversación del mismo cliente con el mismo servicio no es "solicitud nueva" sino mensaje', async () => {
    const f = canalFalso();
    usarCanal('fcm', f.canal);
    const { pro, cli, servicio } = await escenario();
    await api.post('/api/conversations').set(cli.auth).send({ provider_id: pro.providerId, service_id: servicio, initial_message: 'hola' });
    await api.post('/api/conversations').set(cli.auth).send({ provider_id: pro.providerId, service_id: servicio, initial_message: 'sigo esperando' });
    await esperarAvisosPendientes();
    expect(f.enviados.map((e) => e.n.titulo.split(' de ')[0])).toEqual(['Nueva solicitud', 'Nuevo mensaje']);
  });

  it('un token inválido se borra', async () => {
    const f = canalFalso('token_invalido');
    usarCanal('fcm', f.canal);
    const { pro, cli, servicio } = await escenario();
    await api.post('/api/conversations').set(cli.auth).send({ provider_id: pro.providerId, service_id: servicio, initial_message: 'hola' });
    await esperarAvisosPendientes();
    expect(db.prepare('SELECT COUNT(*) AS n FROM push_devices WHERE user_id = ?').get(pro.userId)).toEqual({ n: 0 });
  });

  it('si el canal falla o tarda, el mensaje se guarda y responde rápido', async () => {
    for (const modo of ['lanza', 'lento'] as const) {
      usarCanal('fcm', canalFalso(modo).canal);
      const { pro, cli, servicio } = await escenario();
      const t0 = Date.now();
      const res = await api.post('/api/conversations').set(cli.auth).send({ provider_id: pro.providerId, service_id: servicio, initial_message: 'hola' });
      expect(res.status).toBe(201);
      expect(Date.now() - t0).toBeLessThan(1000);
    }
    await esperarAvisosPendientes();
  }, 10_000);

  it('sin canal configurado (dev) no pasa nada', async () => {
    usarCanal('fcm', null);
    const { pro, cli, servicio } = await escenario();
    expect((await api.post('/api/conversations').set(cli.auth).send({ provider_id: pro.providerId, service_id: servicio, initial_message: 'hola' })).status).toBe(201);
  });
});
```

Run: `cd oficios-cuba/backend && npx vitest run test/push-avisos.test.ts` → Expected: FAIL.

- [ ] **Step 2: Implementar**

`oficios-cuba/backend/src/push/canal.ts`:
```ts
export interface Notificacion { titulo: string; cuerpo: string; datos: Record<string, string> }
export type ResultadoEnvio = 'ok' | 'token_invalido' | 'error';
export interface CanalPush { enviar(token: string, n: Notificacion): Promise<ResultadoEnvio> }
```

`oficios-cuba/backend/src/push/avisos.ts`:
```ts
import db from '../db/index.js';
import { CanalPush, Notificacion } from './canal.js';
import { borrarToken, Canal, dispositivosDe } from './registro.js';

export type { CanalPush, Notificacion } from './canal.js';

const canales: Partial<Record<Canal, CanalPush>> = {};
const pendientes = new Set<Promise<void>>();

export function usarCanal(canal: Canal, impl: CanalPush | null) {
  if (impl) canales[canal] = impl; else delete canales[canal];
}

export async function avisarUsuario(userId: string, n: Notificacion) {
  for (const d of dispositivosDe(userId)) {
    const canal = canales[d.canal];
    if (!canal) continue;
    try {
      const r = await canal.enviar(d.token, n);
      if (r === 'token_invalido') borrarToken(d.canal, d.token);
      else if (r === 'error') console.warn(`push ${d.canal}: envío fallido a ${userId}`);
    } catch (err) {
      console.warn(`push ${d.canal}: ${(err as Error).message}`);
    }
  }
}

// Dispara y olvida: el push nunca retrasa ni rompe la respuesta del chat.
function enSegundoPlano(tarea: () => Promise<void>) {
  const p = tarea().catch((err) => console.warn('push:', (err as Error).message)).finally(() => pendientes.delete(p));
  pendientes.add(p);
}

export async function esperarAvisosPendientes() {
  while (pendientes.size) await Promise.allSettled([...pendientes]);
}

interface Participantes { client_id: string; provider_user_id: string; client_name: string; provider_name: string; service_title: string | null }

function participantes(conversationId: string) {
  // conversations.provider_id es el PERFIL: el usuario a avisar es provider_profiles.user_id.
  return db.prepare(`
    SELECT c.client_id, pp.user_id AS provider_user_id, cu.full_name AS client_name,
      COALESCE(pp.business_name, pu.full_name) AS provider_name, s.title AS service_title
    FROM conversations c
    JOIN provider_profiles pp ON c.provider_id = pp.id
    JOIN users pu ON pp.user_id = pu.id
    JOIN users cu ON c.client_id = cu.id
    LEFT JOIN services s ON c.service_id = s.id
    WHERE c.id = ?
  `).get(conversationId) as Participantes | undefined;
}

const primerNombre = (nombre: string) => nombre.trim().split(/\s+/)[0];

export function avisarNuevaSolicitud(conversationId: string) {
  enSegundoPlano(async () => {
    const p = participantes(conversationId);
    if (!p) return;
    await avisarUsuario(p.provider_user_id, {
      titulo: `Nueva solicitud de ${primerNombre(p.client_name)}`,
      cuerpo: p.service_title ? `Sobre: ${p.service_title}` : 'Toca para responder',
      datos: { tipo: 'mensaje', conversation_id: conversationId },
    });
  });
}

export function avisarNuevoMensaje(conversationId: string, remitente: 'client' | 'provider') {
  enSegundoPlano(async () => {
    const p = participantes(conversationId);
    if (!p) return;
    const [destino, nombre] = remitente === 'client' ? [p.provider_user_id, primerNombre(p.client_name)] : [p.client_id, p.provider_name];
    await avisarUsuario(destino, { titulo: `Nuevo mensaje de ${nombre}`, cuerpo: 'Toca para leerlo', datos: { tipo: 'mensaje', conversation_id: conversationId } });
  });
}
```

En `oficios-cuba/backend/src/routes/conversations.ts`:
- `import { avisarNuevaSolicitud, avisarNuevoMensaje } from '../push/avisos.js';`
- En `router.post('/')`, la transacción devuelve el id y si la conversación es nueva. Cambiar `return conv.id;` por `return { id: conv.id, nueva };`, declarar `let nueva = false;` antes del `if (!conv)` y poner `nueva = true;` dentro de ese `if`. Después de la transacción:
```ts
  const { id, nueva } = tx();
  if (nueva) avisarNuevaSolicitud(id); else avisarNuevoMensaje(id, 'client');
  res.status(201).json({ conversation: { id } });
```
- En `router.post('/:id/messages')`, justo antes de `res.status(201)...`: `avisarNuevoMensaje(conversation.id, req.user!.user_type);`

- [ ] **Step 3: Pasan**

Run: `cd oficios-cuba/backend && npx vitest run && npm run typecheck` → Expected: PASS.

- [ ] **Step 4: Mutaciones (cada una debe hacer FALLAR un test; restaurar después)**
- En `participantes`, devolver `c.provider_id AS provider_user_id` en vez de `pp.user_id` → falla "avisa al PROVEEDOR".
- En `avisarNuevoMensaje`, invertir el ternario del destino → falla "avisa al cliente y no al proveedor".
- Quitar `borrarToken(...)` → falla "un token inválido se borra".
- Cambiar `enSegundoPlano(async () => {...})` por `await (async () => {...})()` en `avisarNuevaSolicitud` (y hacerla `async`, con `await` en la ruta) → falla "responde rápido".

- [ ] **Step 5: Commit**

```bash
cd ~/Documentos/dev/oficio && git add oficios-cuba/backend && git commit -m "backend: avisos push de solicitud y mensaje con canal intercambiable"
```

---

### Task 6: Backend — canal FCM HTTP v1 y script de prueba

**Files:**
- Create: `oficios-cuba/backend/src/push/fcm.ts`, `oficios-cuba/backend/src/scripts/push-prueba.ts`
- Modify: `oficios-cuba/backend/src/index.ts` (activar el canal si hay credenciales), `oficios-cuba/backend/package.json` (script `push:prueba`), `oficios-cuba/.env.example`
- Test: `oficios-cuba/backend/test/push-fcm.test.ts`

**Interfaces:**
- Consumes: `CanalPush`, `Notificacion`, `ResultadoEnvio` (Task 5); `usarCanal`, `avisarUsuario`.
- Produces: `crearCanalFcm(cuenta: { project_id: string; client_email: string; private_key: string }, fetchImpl = fetch): CanalPush`; `cargarCuentaFcm(ruta?: string)`.

Protocolo (documentación de FCM HTTP v1): token OAuth con un JWT RS256 firmado por la cuenta de servicio (`iss`=`client_email`, `scope`=`https://www.googleapis.com/auth/firebase.messaging`, `aud`=`https://oauth2.googleapis.com/token`, `exp` ≤ 1 h) → `POST https://oauth2.googleapis.com/token` (`grant_type=urn:ietf:params:oauth:grant-type:jwt-bearer`). Envío: `POST https://fcm.googleapis.com/v1/projects/{project_id}/messages:send`. Token inválido = HTTP 404 con `UNREGISTERED`, o 400 `INVALID_ARGUMENT` mencionando el token. Antes de implementar, **confirmar estos detalles en la documentación actual de FCM** (context7 o firebase.google.com/docs/cloud-messaging/send-message).

- [ ] **Step 1: Test (falla)**

`oficios-cuba/backend/test/push-fcm.test.ts`:
```ts
import { generateKeyPairSync } from 'crypto';
import jwt from 'jsonwebtoken';
import { describe, expect, it, vi } from 'vitest';
import { crearCanalFcm } from '../src/push/fcm.js';

const { privateKey, publicKey } = generateKeyPairSync('rsa', { modulusLength: 2048 });
const cuenta = { project_id: 'oficios-test', client_email: 'push@oficios-test.iam.gserviceaccount.com', private_key: privateKey.export({ type: 'pkcs8', format: 'pem' }).toString() };
const n = { titulo: 'Nuevo mensaje de Laura', cuerpo: 'Toca para leerlo', datos: { tipo: 'mensaje', conversation_id: 'c1' } };
const json = (status: number, body: unknown) => new Response(JSON.stringify(body), { status, headers: { 'content-type': 'application/json' } });

function fetchFalso(envio: () => Response) {
  return vi.fn(async (url: string, init: RequestInit) => {
    if (url === 'https://oauth2.googleapis.com/token') {
      const assertion = new URLSearchParams(init.body as string).get('assertion')!;
      const claims = jwt.verify(assertion, publicKey.export({ type: 'spki', format: 'pem' }).toString(), { algorithms: ['RS256'] }) as Record<string, unknown>;
      expect(claims.scope).toBe('https://www.googleapis.com/auth/firebase.messaging');
      return json(200, { access_token: 'ACCESO', expires_in: 3600 });
    }
    return envio();
  });
}

describe('canal FCM', () => {
  it('envía con el token OAuth y el formato v1 (canal Android "mensajes", prioridad alta)', async () => {
    const f = fetchFalso(() => json(200, { name: 'projects/oficios-test/messages/1' }));
    expect(await crearCanalFcm(cuenta, f as unknown as typeof fetch).enviar('TOK', n)).toBe('ok');
    const [url, init] = f.mock.calls[1] as unknown as [string, RequestInit];
    expect(url).toBe('https://fcm.googleapis.com/v1/projects/oficios-test/messages:send');
    expect((init.headers as Record<string, string>).Authorization).toBe('Bearer ACCESO');
    expect(JSON.parse(init.body as string)).toEqual({
      message: {
        token: 'TOK',
        notification: { title: n.titulo, body: n.cuerpo },
        data: n.datos,
        android: { priority: 'high', notification: { channel_id: 'mensajes' } },
      },
    });
  });

  it('reutiliza el token OAuth entre envíos', async () => {
    const f = fetchFalso(() => json(200, {}));
    const canal = crearCanalFcm(cuenta, f as unknown as typeof fetch);
    await canal.enviar('A', n);
    await canal.enviar('B', n);
    expect(f.mock.calls.filter((c) => c[0] === 'https://oauth2.googleapis.com/token')).toHaveLength(1);
  });

  it('UNREGISTERED → token_invalido; 500 → error', async () => {
    const invalido = fetchFalso(() => json(404, { error: { status: 'NOT_FOUND', details: [{ errorCode: 'UNREGISTERED' }] } }));
    expect(await crearCanalFcm(cuenta, invalido as unknown as typeof fetch).enviar('X', n)).toBe('token_invalido');
    const caido = fetchFalso(() => json(500, { error: { status: 'INTERNAL' } }));
    expect(await crearCanalFcm(cuenta, caido as unknown as typeof fetch).enviar('X', n)).toBe('error');
  });
});
```

Run: `cd oficios-cuba/backend && npx vitest run test/push-fcm.test.ts` → Expected: FAIL.

- [ ] **Step 2: Implementar**

`oficios-cuba/backend/src/push/fcm.ts`:
```ts
import { readFileSync } from 'fs';
import jwt from 'jsonwebtoken';
import { CanalPush, Notificacion, ResultadoEnvio } from './canal.js';

interface CuentaServicio { project_id: string; client_email: string; private_key: string }

export function cargarCuentaFcm(ruta = process.env.FCM_SERVICE_ACCOUNT_FILE): CuentaServicio | null {
  if (!ruta) return null;
  const c = JSON.parse(readFileSync(ruta, 'utf8'));
  if (!c.project_id || !c.client_email || !c.private_key) throw new Error(`${ruta} no es una cuenta de servicio de Firebase`);
  return c;
}

export function crearCanalFcm(cuenta: CuentaServicio, fetchImpl: typeof fetch = fetch): CanalPush {
  let acceso: { token: string; vence: number } | null = null;

  async function tokenAcceso() {
    if (acceso && acceso.vence > Date.now() + 60_000) return acceso.token;
    const ahora = Math.floor(Date.now() / 1000);
    const assertion = jwt.sign(
      { iss: cuenta.client_email, scope: 'https://www.googleapis.com/auth/firebase.messaging', aud: 'https://oauth2.googleapis.com/token', iat: ahora, exp: ahora + 3600 },
      cuenta.private_key,
      { algorithm: 'RS256' },
    );
    const res = await fetchImpl('https://oauth2.googleapis.com/token', {
      method: 'POST',
      headers: { 'Content-Type': 'application/x-www-form-urlencoded' },
      body: new URLSearchParams({ grant_type: 'urn:ietf:params:oauth:grant-type:jwt-bearer', assertion }).toString(),
    });
    if (!res.ok) throw new Error(`OAuth de FCM respondió ${res.status}`);
    const d = (await res.json()) as { access_token: string; expires_in: number };
    acceso = { token: d.access_token, vence: Date.now() + d.expires_in * 1000 };
    return acceso.token;
  }

  return {
    async enviar(token: string, n: Notificacion): Promise<ResultadoEnvio> {
      const res = await fetchImpl(`https://fcm.googleapis.com/v1/projects/${cuenta.project_id}/messages:send`, {
        method: 'POST',
        headers: { Authorization: `Bearer ${await tokenAcceso()}`, 'Content-Type': 'application/json' },
        body: JSON.stringify({
          message: {
            token,
            notification: { title: n.titulo, body: n.cuerpo },
            data: n.datos,
            // Mismo id de canal que crea la app (expo-notifications, Task 9).
            android: { priority: 'high', notification: { channel_id: 'mensajes' } },
          },
        }),
      });
      if (res.ok) return 'ok';
      const cuerpo = JSON.stringify(await res.json().catch(() => ({})));
      if (res.status === 404 || /UNREGISTERED|registration token/i.test(cuerpo)) return 'token_invalido';
      return 'error';
    },
  };
}
```

En `oficios-cuba/backend/src/index.ts`, dentro de `start()` antes de `app.listen`:
```ts
  const cuentaFcm = cargarCuentaFcm();
  if (cuentaFcm) {
    usarCanal('fcm', crearCanalFcm(cuentaFcm));
    console.log(`Push FCM activo (proyecto ${cuentaFcm.project_id})`);
  } else {
    console.log('Push FCM desactivado: falta FCM_SERVICE_ACCOUNT_FILE');
  }
```
con `import { cargarCuentaFcm, crearCanalFcm } from './push/fcm.js';` y `import { usarCanal } from './push/avisos.js';`.

`oficios-cuba/backend/src/scripts/push-prueba.ts` (protocolo de Cuba, §6.1):
```ts
// Envía N notificaciones de prueba a todos los dispositivos de un usuario, espaciadas, y anota el resultado.
//   Producción: docker exec oficio_api node dist/scripts/push-prueba.js <email> [n=10] [segundos=30]
import 'dotenv/config';
import db, { initDatabase } from '../db/index.js';
import { crearCanalFcm, cargarCuentaFcm } from '../push/fcm.js';
import { dispositivosDe } from '../push/registro.js';

initDatabase();
const [email, nArg = '10', segArg = '30'] = process.argv.slice(2);
const cuenta = cargarCuentaFcm();
if (!email || !cuenta) {
  console.error('Uso: push-prueba <email> [n] [segundos]  (requiere FCM_SERVICE_ACCOUNT_FILE)');
  process.exit(2);
}
const usuario = db.prepare('SELECT id FROM users WHERE email = ?').get(email.toLowerCase()) as { id: string } | undefined;
if (!usuario) { console.error(`No existe ${email}`); process.exit(1); }
const dispositivos = dispositivosDe(usuario.id);
if (!dispositivos.length) { console.error('Ese usuario no tiene dispositivos registrados (¿abrió la app con sesión?)'); process.exit(1); }

const canal = crearCanalFcm(cuenta);
const n = Number(nArg);
(async () => {
  for (let i = 1; i <= n; i++) {
    const hora = new Date().toISOString().slice(11, 19);
    for (const d of dispositivos) {
      const r = await canal.enviar(d.token, { titulo: `Prueba ${i}/${n} · ${hora} UTC`, cuerpo: 'Anota a qué hora te llegó', datos: { tipo: 'prueba', n: String(i) } });
      console.log(`${hora} UTC  #${i}  …${d.token.slice(-8)}  ${r}`);
    }
    if (i < n) await new Promise((r) => setTimeout(r, Number(segArg) * 1000));
  }
})();
```

En `oficios-cuba/backend/package.json` → `"push:prueba": "tsx src/scripts/push-prueba.ts"`.

En `oficios-cuba/.env.example` añadir:
```
# Push FCM: ruta DENTRO del contenedor al JSON de la cuenta de servicio de Firebase (no subir a git).
# FCM_SERVICE_ACCOUNT_FILE=/app/secrets/fcm.json
```

- [ ] **Step 3: Pasan**

Run: `cd oficios-cuba/backend && npx vitest run && npm run typecheck` → Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd ~/Documentos/dev/oficio && git add oficios-cuba/backend oficios-cuba/.env.example && git commit -m "backend: canal FCM HTTP v1 y script de prueba de push"
```

---

### Task 7: 🔑 Credenciales de Firebase (acción de Dariel/Doniet — bloquea Tasks 9–11)

**Files:** ninguno en git. Resultado: `oficios-cuba/mobile/google-services.json` (local, gitignorado) y `fcm.json` preparado para vps2.

- [ ] **Step 1: Explicar y pedir** (no avanzar sin esto). Dariel o Doniet, con una cuenta de Google de DARDOIT:
  1. Crear el proyecto de Firebase **"oficios-cuba"** en console.firebase.google.com.
  2. Añadir una app **Android** con paquete `com.dardoit.oficios` → descargar `google-services.json`.
  3. Configuración del proyecto → Cuentas de servicio → **Generar nueva clave privada** → `fcm.json`.
- [ ] **Step 2: Recibirlos sin pegarlos en el chat** (regla #7). Crear los destinos vacíos con permisos 600 y dar la ruta:
```bash
install -m 600 /dev/null ~/Documentos/dev/oficio/oficios-cuba/mobile/google-services.json
install -m 600 /dev/null ~/.claude/.oficio-fcm.json
```
Dariel pega el contenido en esos archivos. Verificar sin mostrar secretos:
```bash
python3 -c "import json;d=json.load(open('$HOME/Documentos/dev/oficio/oficios-cuba/mobile/google-services.json'));print(d['project_info']['project_id'],[c['client_info']['android_client_info']['package_name'] for c in d['client']])"
python3 -c "import json;d=json.load(open('$HOME/.claude/.oficio-fcm.json'));print(d['project_id'],d['client_email'],'private_key' in d)"
cd ~/Documentos/dev/oficio && git status --short | grep -c google-services || true   # debe ser 0
```
Expected: `oficios-cuba ['com.dardoit.oficios']`, el email de la cuenta de servicio y `True`; git no ve el archivo.

---

### Task 8: App — sesión, entrar/registro y el flujo mínimo solicitud → chat

**Files:**
- Create: `oficios-cuba/mobile/src/lib/sesion.ts`, `oficios-cuba/mobile/src/lib/contexto.tsx`, `oficios-cuba/mobile/app/(auth)/entrar.tsx`, `oficios-cuba/mobile/app/(auth)/registro.tsx`, `oficios-cuba/mobile/app/servicio/[id].tsx`, `oficios-cuba/mobile/app/conversacion/[id].tsx`, `oficios-cuba/mobile/src/componentes/TarjetaServicio.tsx`
- Modify: `oficios-cuba/mobile/app/_layout.tsx`, `oficios-cuba/mobile/app/(tabs)/index.tsx`, `oficios-cuba/mobile/app/(tabs)/mensajes.tsx`, `oficios-cuba/mobile/app/(tabs)/cuenta.tsx`, `oficios-cuba/mobile/src/lib/api.ts`
- Test: `oficios-cuba/mobile/test/sesion.test.ts`, `oficios-cuba/mobile/jest.config.js`

**Interfaces:**
- Consumes: `crearCliente`, `ErrorApi`, `esquemaLogin`, `esquemaRegistro`, `esquemaMensaje`, `formatPrice`, `relativeTime`, `shortTime`, `nombreVisible` de `@oficio/shared`; `configApi`, `urlImagen` (Task 3).
- Produces:
  - `almacenToken: { leer(): Promise<string|null>; guardar(t): Promise<void>; borrar(): Promise<void> }` (sobre SecureStore, inyectable para tests).
  - `crearSesion(deps: { almacen; api: ClienteApi })` → `{ arrancar(): Promise<User|null>; entrar(d): Promise<User>; registrarse(d): Promise<User>; salir(): Promise<void> }`.
  - `useSesion(): { usuario: User | null; cargando: boolean; entrar; registrarse; salir; api: ClienteApi }` y `<ProveedorSesion>`.
  - `requiereSesion(router, usuario, volverA: string): boolean` — si no hay sesión navega a `/(auth)/entrar?volver=...` y devuelve `false`.

- [ ] **Step 1: Configurar jest-expo y test de sesión (falla)**

```bash
cd ~/Documentos/dev/oficio/oficios-cuba/mobile && npx expo install jest-expo jest @types/jest -- --save-dev
```
`oficios-cuba/mobile/jest.config.js`:
```js
module.exports = { preset: 'jest-expo', testMatch: ['<rootDir>/test/**/*.test.ts'] };
```
En `package.json` → `"test": "jest"`.

`oficios-cuba/mobile/test/sesion.test.ts`:
```ts
import { ErrorApi } from '@oficio/shared';
import { crearSesion } from '../src/lib/sesion';

function almacenFalso(inicial: string | null = null) {
  let valor = inicial;
  return { leer: jest.fn(async () => valor), guardar: jest.fn(async (t: string) => { valor = t; }), borrar: jest.fn(async () => { valor = null; }), get valor() { return valor; } };
}
const usuario = { id: 'u1', email: 'a@b.cu', full_name: 'Ana', user_type: 'client', is_verified: false } as const;

describe('sesión', () => {
  it('sin token arranca como visitante sin llamar a la API', async () => {
    const api = { auth: { me: jest.fn() } } as any;
    expect(await crearSesion({ almacen: almacenFalso(), api }).arrancar()).toBeNull();
    expect(api.auth.me).not.toHaveBeenCalled();
  });

  it('con token válido recupera el usuario', async () => {
    const api = { auth: { me: jest.fn(async () => ({ user: usuario })) } } as any;
    expect(await crearSesion({ almacen: almacenFalso('T'), api }).arrancar()).toEqual(usuario);
  });

  it('token rechazado (401) → se borra y queda visitante', async () => {
    const almacen = almacenFalso('T');
    const api = { auth: { me: jest.fn(async () => { throw new ErrorApi(401, 'Token inválido'); }) } } as any;
    expect(await crearSesion({ almacen, api }).arrancar()).toBeNull();
    expect(almacen.valor).toBeNull();
  });

  it('sin red al arrancar NO cierra la sesión (se reintenta luego)', async () => {
    const almacen = almacenFalso('T');
    const api = { auth: { me: jest.fn(async () => { throw new ErrorApi(0, 'Sin conexión'); }) } } as any;
    await expect(crearSesion({ almacen, api }).arrancar()).rejects.toMatchObject({ status: 0 });
    expect(almacen.valor).toBe('T');
  });

  it('entrar guarda el token', async () => {
    const almacen = almacenFalso();
    const api = { auth: { login: jest.fn(async () => ({ token: 'NUEVO', user: usuario })) } } as any;
    expect(await crearSesion({ almacen, api }).entrar({ email: 'a@b.cu', password: 'x' })).toEqual(usuario);
    expect(almacen.valor).toBe('NUEVO');
  });
});
```

Run: `cd oficios-cuba/mobile && npx jest` → Expected: FAIL (no existe `sesion`).

- [ ] **Step 2: Implementar sesión y contexto**

`oficios-cuba/mobile/src/lib/sesion.ts`:
```ts
import * as SecureStore from 'expo-secure-store';
import { ClienteApi, DatosLogin, DatosRegistro, ErrorApi, User } from '@oficio/shared';

const CLAVE = 'oficio_token';

export const almacenToken = {
  leer: () => SecureStore.getItemAsync(CLAVE),
  guardar: (t: string) => SecureStore.setItemAsync(CLAVE, t),
  borrar: () => SecureStore.deleteItemAsync(CLAVE),
};

type Almacen = { leer(): Promise<string | null>; guardar(t: string): Promise<void>; borrar(): Promise<void> };

export function crearSesion({ almacen, api }: { almacen: Almacen; api: ClienteApi }) {
  return {
    async arrancar(): Promise<User | null> {
      if (!(await almacen.leer())) return null;
      try {
        return (await api.auth.me()).user;
      } catch (err) {
        // Solo un rechazo del servidor invalida la sesión; sin red se conserva y se reintenta.
        if (err instanceof ErrorApi && err.status === 401) {
          await almacen.borrar();
          return null;
        }
        throw err;
      }
    },
    async entrar(d: DatosLogin) {
      const r = await api.auth.login(d);
      await almacen.guardar(r.token);
      return r.user;
    },
    async registrarse(d: DatosRegistro) {
      const r = await api.auth.register(d);
      await almacen.guardar(r.token);
      return r.user;
    },
    async salir() {
      await almacen.borrar();
    },
  };
}
```

`oficios-cuba/mobile/src/lib/contexto.tsx`:
```tsx
import { createContext, ReactNode, useContext, useEffect, useMemo, useState } from 'react';
import { crearCliente, DatosLogin, DatosRegistro, User } from '@oficio/shared';
import type { Router } from 'expo-router';
import { configApi } from './api';
import { almacenToken, crearSesion } from './sesion';

type Valor = {
  usuario: User | null; cargando: boolean; sinRed: boolean;
  entrar(d: DatosLogin): Promise<void>; registrarse(d: DatosRegistro): Promise<void>; salir(): Promise<void>; reintentar(): void;
  api: ReturnType<typeof crearCliente>;
};
const Contexto = createContext<Valor | null>(null);

export function ProveedorSesion({ children, alSalir }: { children: ReactNode; alSalir?: () => Promise<void> }) {
  const [usuario, setUsuario] = useState<User | null>(null);
  const [cargando, setCargando] = useState(true);
  const [sinRed, setSinRed] = useState(false);
  const [intento, setIntento] = useState(0);

  const api = useMemo(() => crearCliente({
    baseUrl: configApi.baseUrl,
    getToken: almacenToken.leer,
    onUnauthorized: () => { void almacenToken.borrar(); setUsuario(null); },
  }), []);
  const sesion = useMemo(() => crearSesion({ almacen: almacenToken, api }), [api]);

  useEffect(() => {
    sesion.arrancar()
      .then((u) => { setUsuario(u); setSinRed(false); })
      .catch(() => setSinRed(true))
      .finally(() => setCargando(false));
  }, [sesion, intento]);

  const valor: Valor = {
    usuario, cargando, sinRed, api,
    entrar: async (d) => setUsuario(await sesion.entrar(d)),
    registrarse: async (d) => setUsuario(await sesion.registrarse(d)),
    salir: async () => { await alSalir?.(); await sesion.salir(); setUsuario(null); },
    reintentar: () => setIntento((n) => n + 1),
  };
  return <Contexto.Provider value={valor}>{children}</Contexto.Provider>;
}

export function useSesion() {
  const v = useContext(Contexto);
  if (!v) throw new Error('useSesion fuera de ProveedorSesion');
  return v;
}

export function requiereSesion(router: Router, usuario: User | null, volverA: string) {
  if (usuario) return true;
  router.push({ pathname: '/(auth)/entrar', params: { volver: volverA } });
  return false;
}
```

`oficios-cuba/mobile/app/_layout.tsx`: envolver el `<Stack>` con `<ProveedorSesion>` dentro del `QueryClientProvider`, y registrar pantallas: `(auth)/entrar` y `(auth)/registro` como `presentation: 'modal'`, `servicio/[id]` con `title: ''`, `conversacion/[id]` con `title: 'Conversación'`.

- [ ] **Step 3: Pantallas de entrar y registro**

`oficios-cuba/mobile/app/(auth)/entrar.tsx`:
```tsx
import { useState } from 'react';
import { Text } from 'react-native';
import { router, useLocalSearchParams, Link } from 'expo-router';
import { ErrorApi, esquemaLogin } from '@oficio/shared';
import { Pantalla } from '../../src/componentes/Pantalla';
import { Campo } from '../../src/componentes/Campo';
import { Boton } from '../../src/componentes/Boton';
import { useSesion } from '../../src/lib/contexto';
import { colores } from '../../src/lib/tema';

export default function Entrar() {
  const { volver } = useLocalSearchParams<{ volver?: string }>();
  const { entrar } = useSesion();
  const [email, setEmail] = useState('');
  const [password, setPassword] = useState('');
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);

  async function enviar() {
    const d = esquemaLogin.safeParse({ email, password });
    if (!d.success) return setError(d.error.issues[0].message);
    setEnviando(true); setError(undefined);
    try {
      await entrar(d.data);
      router.dismissAll();
      if (volver) router.push(volver as never);
    } catch (e) {
      setError(e instanceof ErrorApi ? e.message : 'Algo salió mal. Inténtalo de nuevo.');
    } finally { setEnviando(false); }
  }

  return (
    <Pantalla titulo="Entrar">
      <Campo etiqueta="Email" value={email} onChangeText={setEmail} autoCapitalize="none" keyboardType="email-address" autoComplete="email" />
      <Campo etiqueta="Contraseña" value={password} onChangeText={setPassword} secureTextEntry autoComplete="password" />
      {error ? <Text style={{ color: colores.error }}>{error}</Text> : null}
      <Boton titulo="Entrar" onPress={enviar} cargando={enviando} />
      <Link href={{ pathname: '/(auth)/registro', params: { volver } }} style={{ color: colores.acento, textAlign: 'center' }}>¿No tienes cuenta? Crear cuenta</Link>
    </Pantalla>
  );
}
```

`oficios-cuba/mobile/app/(auth)/registro.tsx`: misma estructura, con campos Nombre completo, Email, Teléfono (obligatorio si proveedor, con el aviso *"Los clientes te contactarán por este número."*, igual que la web), Contraseña, y un selector de dos botones **"Busco un profesional" / "Ofrezco mis servicios"** (`user_type` `client` / `provider`). Valida con `esquemaRegistro.safeParse({ ..., phone: telefono.trim() || undefined })` y, si es proveedor y no hay teléfono, muestra ese aviso como error del campo. Al terminar: `registrarse(d)` → `router.dismissAll()` → `volver` si existe.

- [ ] **Step 4: Inicio, servicio y chat (flujo mínimo de la prueba)**

`oficios-cuba/mobile/src/componentes/TarjetaServicio.tsx`:
```tsx
import { Image } from 'expo-image';
import { Pressable, StyleSheet, Text, View } from 'react-native';
import { router } from 'expo-router';
import { formatPrice, nombreVisible, ServiceSummary } from '@oficio/shared';
import { urlImagen } from '../lib/api';
import { colores, espacio, fuentes } from '../lib/tema';

export function TarjetaServicio({ s }: { s: ServiceSummary }) {
  return (
    <Pressable accessibilityRole="link" onPress={() => router.push(`/servicio/${s.id}`)} style={e.tarjeta}>
      {s.cover ? <Image source={urlImagen(s.cover)} style={e.foto} contentFit="cover" cachePolicy="disk" /> : <View style={[e.foto, { backgroundColor: colores.borde }]} />}
      <View style={{ padding: espacio(3), gap: 2 }}>
        <Text style={e.titulo} numberOfLines={2}>{s.title}</Text>
        <Text style={e.sub} numberOfLines={1}>{nombreVisible(s)} · {s.municipality_name ?? s.province_name ?? ''}</Text>
        <Text style={e.precio}>{formatPrice(s)}</Text>
      </View>
    </Pressable>
  );
}

const e = StyleSheet.create({
  tarjeta: { backgroundColor: colores.superficie, borderRadius: 16, overflow: 'hidden', borderWidth: 1, borderColor: colores.borde },
  foto: { width: '100%', aspectRatio: 16 / 9 },
  titulo: { fontFamily: fuentes.textoFuerte, fontSize: 16, color: colores.tinta },
  sub: { fontFamily: fuentes.texto, color: colores.tintaSuave },
  precio: { fontFamily: fuentes.textoFuerte, color: colores.acento },
});
```
(instalar antes: `npx expo install expo-image`)

`oficios-cuba/mobile/app/(tabs)/index.tsx`: `useInfiniteQuery({ queryKey: ['servicios','nuevos'], queryFn: ({ pageParam }) => api.servicios.listar({ sort: 'newest', page: pageParam, limit: 12 }), initialPageParam: 1, getNextPageParam: (u) => u.pagination.page < u.pagination.totalPages ? u.pagination.page + 1 : undefined })`, render con `FlatList` de `TarjetaServicio`, `onEndReached` → `fetchNextPage`, `refreshing`/`onRefresh`, estado de error con `ErrorApi.message` y botón "Reintentar". Título "Servicios nuevos".

`oficios-cuba/mobile/app/servicio/[id].tsx`: `useQuery(['servicio', id], () => api.servicios.detalle(id))`; muestra primera foto, título, `formatPrice`, `nombreVisible`, descripción, y el botón **"Pedir presupuesto"**: si `requiereSesion(router, usuario, `/servicio/${id}`)` y el usuario es cliente, abre un `Campo` multilínea con el texto sugerido *"Hola, me interesa «{title}». ¿Tienes disponibilidad?"* y al enviar `api.conversaciones.crear({ provider_id: service.provider_id, service_id: id, initial_message })` → `router.replace(`/conversacion/${conversation.id}`)`. Si `service.is_owner` o el usuario es proveedor, no muestra el botón.

`oficios-cuba/mobile/app/conversacion/[id].tsx`:
```tsx
import { useEffect, useRef, useState } from 'react';
import { AppState, FlatList, KeyboardAvoidingView, Platform, Text, TextInput, View } from 'react-native';
import { useLocalSearchParams, useNavigation } from 'expo-router';
import { ErrorApi, esquemaMensaje, Message, shortTime } from '@oficio/shared';
import { Boton } from '../../src/componentes/Boton';
import { useSesion } from '../../src/lib/contexto';
import { colores, espacio, fuentes } from '../../src/lib/tema';

export default function Conversacion() {
  const { id } = useLocalSearchParams<{ id: string }>();
  const { api, usuario } = useSesion();
  const navegacion = useNavigation();
  const [mensajes, setMensajes] = useState<Message[]>([]);
  const [texto, setTexto] = useState('');
  const [error, setError] = useState<string>();
  const [enviando, setEnviando] = useState(false);
  const ultimo = useRef<string | undefined>(undefined);

  useEffect(() => {
    let vivo = true;
    let reloj: ReturnType<typeof setInterval> | undefined;
    async function traer() {
      try {
        const r = await api.conversaciones.detalle(id, ultimo.current);
        if (!vivo) return;
        if (!ultimo.current) navegacion.setOptions({ title: usuario?.user_type === 'client' ? r.conversation.provider_name : r.conversation.client_name });
        if (r.messages.length) {
          ultimo.current = r.messages[r.messages.length - 1].created_at;
          setMensajes((m) => [...m, ...r.messages.filter((n) => !m.some((x) => x.id === n.id))]);
        }
        setError(undefined);
      } catch (e) { if (vivo) setError(e instanceof ErrorApi ? e.message : 'No se pudo actualizar'); }
    }
    // Sondeo solo en primer plano: en segundo plano no se gastan datos.
    const iniciar = () => { void traer(); reloj = setInterval(traer, 10_000); };
    const parar = () => { if (reloj) clearInterval(reloj); reloj = undefined; };
    iniciar();
    const sub = AppState.addEventListener('change', (e) => (e === 'active' ? (parar(), iniciar()) : parar()));
    return () => { vivo = false; parar(); sub.remove(); };
  }, [api, id]);

  async function enviar() {
    const d = esquemaMensaje.safeParse({ content: texto });
    if (!d.success) return;
    setEnviando(true);
    try {
      const { message } = await api.conversaciones.enviar(id, d.data.content);
      setMensajes((m) => [...m, message]);
      ultimo.current = message.created_at;
      setTexto(''); setError(undefined);
    } catch (e) { setError(e instanceof ErrorApi ? e.message : 'No se pudo enviar. Inténtalo de nuevo.'); }
    finally { setEnviando(false); }
  }

  return (
    <KeyboardAvoidingView style={{ flex: 1, backgroundColor: colores.fondo }} behavior={Platform.OS === 'ios' ? 'padding' : undefined} keyboardVerticalOffset={90}>
      <FlatList
        data={mensajes}
        keyExtractor={(m) => m.id}
        contentContainerStyle={{ padding: espacio(4), gap: espacio(2) }}
        renderItem={({ item }) => {
          const mio = item.sender_type === usuario?.user_type;
          return (
            <View style={{ alignSelf: mio ? 'flex-end' : 'flex-start', maxWidth: '80%', backgroundColor: mio ? colores.acento : colores.superficie, borderRadius: 16, padding: espacio(3) }}>
              <Text style={{ fontFamily: fuentes.texto, color: mio ? colores.acentoTexto : colores.tinta }}>{item.content}</Text>
              <Text style={{ fontSize: 11, marginTop: 2, color: mio ? colores.acentoTexto : colores.tintaTenue }}>{shortTime(item.created_at)}</Text>
            </View>
          );
        }}
      />
      {error ? <Text style={{ color: colores.error, paddingHorizontal: espacio(4) }}>{error}</Text> : null}
      <View style={{ flexDirection: 'row', gap: espacio(2), padding: espacio(3), borderTopWidth: 1, borderColor: colores.borde, backgroundColor: colores.superficie }}>
        <TextInput value={texto} onChangeText={setTexto} placeholder="Escribe un mensaje" multiline maxLength={2000} accessibilityLabel="Mensaje"
          style={{ flex: 1, minHeight: 44, maxHeight: 120, fontFamily: fuentes.texto, fontSize: 16, color: colores.tinta }} />
        <Boton titulo="Enviar" onPress={enviar} cargando={enviando} deshabilitado={!texto.trim()} />
      </View>
    </KeyboardAvoidingView>
  );
}
```

`oficios-cuba/mobile/app/(tabs)/mensajes.tsx`: sin sesión → texto "Entra para ver tus mensajes" + botón que llama a `requiereSesion(router, null, '/mensajes')`. Con sesión → `useQuery(['conversaciones'], api.conversaciones.listar, { refetchOnWindowFocus: true })`, `FlatList` de filas (nombre del otro participante según rol, `service_title`, `last_message`, `relativeTime(last_message_at)`, insignia con `unread_count` si > 0) → `router.push(`/conversacion/${c.id}`)`. Pull-to-refresh.

`oficios-cuba/mobile/app/(tabs)/cuenta.tsx`: sin sesión → botones "Entrar" y "Crear cuenta". Con sesión → nombre, email, tipo de cuenta y botón "Cerrar sesión" (`salir()`), más el texto "Versión {Constants.expoConfig?.version}".

- [ ] **Step 5: Tests y verificación en el emulador contra el backend de dev**

```bash
cd ~/Documentos/dev/oficio/oficios-cuba/mobile && npx jest && npx tsc --noEmit
# backend de dev en :3000 (DEMO_MODE=true). El emulador ve el host como 10.0.2.2:
EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api npx expo run:android
```
Lista de comprobación manual (anotar resultado de cada punto en el informe de la tarea):
1. Inicio lista servicios con fotos (las `/demo/*.webp` del backend) y pagina al hacer scroll.
2. Tocar un servicio → detalle → "Pedir presupuesto" sin sesión lleva a Entrar; tras entrar como `cliente@demo.com` / `Demo123!` vuelve al servicio.
3. Enviar la solicitud abre el chat con el mensaje.
4. En otra sesión (web en `http://127.0.0.1:5176` como `proveedor@demo.com`) responder: el mensaje aparece en la app en ≤ 10 s.
5. Cuenta → Cerrar sesión → Mensajes pide entrar.
6. Modo avión en el chat → "Sin conexión…" visible; al volver la red, se recupera sin reiniciar la app.

- [ ] **Step 6: Commit**

```bash
cd ~/Documentos/dev/oficio && git add oficios-cuba/mobile && git commit -m "mobile: sesión, entrar/registro, inicio, servicio y chat con sondeo"
```

---

### Task 9: App — registro de push y apertura de la conversación al tocar

**Files:**
- Create: `oficios-cuba/mobile/src/lib/push.ts`
- Modify: `oficios-cuba/mobile/app/_layout.tsx`
- Test: `oficios-cuba/mobile/test/push.test.ts`

**Interfaces:**
- Consumes: `ClienteApi.push.registrar/borrar` (Task 2), `useSesion` (Task 8).
- Produces: `crearGestorPush(deps: { api; obtenerToken(): Promise<string|null>; plataforma: 'android'|'ios'; version: string; pendientes: { leer(): Promise<string[]>; guardar(l: string[]): Promise<void> } })` → `{ alEntrar(): Promise<void>; alSalir(): Promise<void>; reintentarPendientes(): Promise<void> }`; `rutaDeNotificacion(datos): string | null`.

- [ ] **Step 1: Test (falla)**

`oficios-cuba/mobile/test/push.test.ts`:
```ts
import { ErrorApi } from '@oficio/shared';
import { crearGestorPush, rutaDeNotificacion } from '../src/lib/push';

function deps(api: any, token: string | null = 'FCM-1') {
  let lista: string[] = [];
  return {
    api, obtenerToken: jest.fn(async () => token), plataforma: 'android' as const, version: '0.1.0',
    pendientes: { leer: jest.fn(async () => lista), guardar: jest.fn(async (l: string[]) => { lista = l; }) },
    get lista() { return lista; },
  };
}

describe('gestor de push', () => {
  it('al entrar registra el token FCM del dispositivo', async () => {
    const api = { push: { registrar: jest.fn(async () => undefined), borrar: jest.fn() } };
    await crearGestorPush(deps(api)).alEntrar();
    expect(api.push.registrar).toHaveBeenCalledWith({ canal: 'fcm', token: 'FCM-1', plataforma: 'android', app_version: '0.1.0' });
  });

  it('sin permiso (token null) no registra nada', async () => {
    const api = { push: { registrar: jest.fn(), borrar: jest.fn() } };
    await crearGestorPush(deps(api, null)).alEntrar();
    expect(api.push.registrar).not.toHaveBeenCalled();
  });

  it('al salir sin red guarda el token para borrarlo después, y lo borra al reintentar', async () => {
    const api = { push: { registrar: jest.fn(), borrar: jest.fn().mockRejectedValueOnce(new ErrorApi(0, 'Sin conexión')).mockResolvedValue(undefined) } };
    const d = deps(api);
    const gestor = crearGestorPush(d);
    await gestor.alSalir();
    expect(d.lista).toEqual(['FCM-1']);
    await gestor.reintentarPendientes();
    expect(api.push.borrar).toHaveBeenCalledTimes(2);
    expect(d.lista).toEqual([]);
  });

  it('la notificación de mensaje abre la conversación; otras no navegan', () => {
    expect(rutaDeNotificacion({ tipo: 'mensaje', conversation_id: 'c1' })).toBe('/conversacion/c1');
    expect(rutaDeNotificacion({ tipo: 'prueba', n: '1' })).toBeNull();
    expect(rutaDeNotificacion({ tipo: 'mensaje' })).toBeNull();
  });
});
```

Run: `cd oficios-cuba/mobile && npx jest test/push.test.ts` → Expected: FAIL.

- [ ] **Step 2: Implementar**

`oficios-cuba/mobile/src/lib/push.ts`:
```ts
import * as Device from 'expo-device';
import * as Notifications from 'expo-notifications';
import * as SecureStore from 'expo-secure-store';
import { Platform } from 'react-native';
import type { ClienteApi } from '@oficio/shared';

// Token FCM nativo (getDevicePushTokenAsync), NO el de Expo: así el teléfono no depende
// de los servidores de Expo, cuya disponibilidad desde Cuba no está verificada.
export async function obtenerTokenFcm(): Promise<string | null> {
  if (!Device.isDevice) return null;
  if (Platform.OS === 'android') {
    await Notifications.setNotificationChannelAsync('mensajes', { name: 'Mensajes', importance: Notifications.AndroidImportance.HIGH });
  }
  const actual = await Notifications.getPermissionsAsync();
  const permiso = actual.granted ? actual : await Notifications.requestPermissionsAsync();
  if (!permiso.granted) return null;
  return (await Notifications.getDevicePushTokenAsync()).data as string;
}

export const pendientesDeBorrar = {
  leer: async () => JSON.parse((await SecureStore.getItemAsync('push_pendientes')) ?? '[]') as string[],
  guardar: (l: string[]) => SecureStore.setItemAsync('push_pendientes', JSON.stringify(l)),
};

type Deps = {
  api: Pick<ClienteApi, 'push'>;
  obtenerToken(): Promise<string | null>;
  plataforma: 'android' | 'ios';
  version: string;
  pendientes: { leer(): Promise<string[]>; guardar(l: string[]): Promise<void> };
};

export function crearGestorPush({ api, obtenerToken, plataforma, version, pendientes }: Deps) {
  return {
    async alEntrar() {
      const token = await obtenerToken();
      if (token) await api.push.registrar({ canal: 'fcm', token, plataforma, app_version: version });
    },
    // Si el borrado falla (sin red), el siguiente usuario del teléfono no debe recibir avisos del anterior:
    // se guarda y se reintenta en el próximo arranque.
    async alSalir() {
      const token = await obtenerToken().catch(() => null);
      if (!token) return;
      try { await api.push.borrar(token); } catch { await pendientes.guardar([...new Set([...(await pendientes.leer()), token])]); }
    },
    async reintentarPendientes() {
      const quedan: string[] = [];
      for (const t of await pendientes.leer()) {
        try { await api.push.borrar(t); } catch { quedan.push(t); }
      }
      await pendientes.guardar(quedan);
    },
  };
}

export function rutaDeNotificacion(datos: Record<string, unknown> | undefined): string | null {
  return datos?.tipo === 'mensaje' && typeof datos.conversation_id === 'string' ? `/conversacion/${datos.conversation_id}` : null;
}
```

Integración en `oficios-cuba/mobile/app/_layout.tsx`:
- Antes del componente: `Notifications.setNotificationHandler({ handleNotification: async () => ({ shouldShowBanner: true, shouldShowList: true, shouldPlaySound: true, shouldSetBadge: false }) });` (confirmar los nombres de campos en la doc de expo-notifications SDK 57 si el tipo no compila).
- Un componente hijo `<Push />` dentro de `ProveedorSesion` que:
  - crea el gestor con `api` de `useSesion()`, `obtenerTokenFcm`, `Platform.OS`, `Constants.expoConfig?.version ?? '0.0.0'`, `pendientesDeBorrar`;
  - `useEffect` cuando `usuario` pasa a no nulo → `gestor.reintentarPendientes().then(() => gestor.alEntrar()).catch(() => {})`;
  - `Notifications.useLastNotificationResponse()` → si hay respuesta, `const ruta = rutaDeNotificacion(r.notification.request.content.data)` y `router.push(ruta)`;
  - invalida `['conversaciones']` en react-query al recibir una notificación en primer plano (`Notifications.addNotificationReceivedListener`).
- Cerrar sesión debe borrar el token, pero el gestor necesita el `api` que crea `ProveedorSesion` (no puede crearse fuera). Usar una referencia: en el layout `const gestorRef = useRef<ReturnType<typeof crearGestorPush> | null>(null);`, `<ProveedorSesion alSalir={() => gestorRef.current?.alSalir() ?? Promise.resolve()}>`, y `<Push gestorRef={gestorRef} />` asigna `gestorRef.current` al crear el gestor.

- [ ] **Step 3: Pasan**

Run: `cd oficios-cuba/mobile && npx jest && npx tsc --noEmit` → Expected: PASS.

- [ ] **Step 4: Commit**

```bash
cd ~/Documentos/dev/oficio && git add oficios-cuba/mobile && git commit -m "mobile: registro de push FCM y apertura del chat al tocar la notificación"
```

---

### Task 10: Prueba de push de punta a punta en j-u (emulador con Google Play)

**Prerrequisito:** Task 7 hecha (credenciales). El emulador debe ser una imagen **con Google Play** (FCM necesita Google Play Services).

- [ ] **Step 1: Backend de dev con FCM**
```bash
cd ~/Documentos/dev/oficio/oficios-cuba/backend
FCM_SERVICE_ACCOUNT_FILE=$HOME/.claude/.oficio-fcm.json npm run dev   # log esperado: "Push FCM activo (proyecto oficios-cuba)"
```
- [ ] **Step 2: App en el emulador (Google Play) con la API de dev**
```bash
~/Android/Sdk/emulator/emulator -list-avds     # elegir uno "google_apis_playstore"; si no hay, crearlo con avdmanager (system-images;android-35;google_apis_playstore;x86_64)
cd ~/Documentos/dev/oficio/oficios-cuba/mobile && EXPO_PUBLIC_API_URL=http://10.0.2.2:3000/api npx expo run:android
```
- [ ] **Step 3: Verificar**
  1. Entrar como `proveedor@demo.com`, aceptar el permiso de notificaciones → `sqlite3`-free: `node -e "console.log(require('better-sqlite3')('data/oficios.db').prepare('SELECT canal, plataforma, substr(token,-8) t FROM push_devices').all())"` muestra el dispositivo.
  2. Mandar la app a segundo plano. Desde la web de dev como `cliente@demo.com`, abrir una solicitud a ElectroHogar Vedado (el proveedor demo) → en el emulador aparece **"Nueva solicitud de Laura"**, sin el texto del mensaje.
  3. Tocarla → abre esa conversación.
  4. `npm run push:prueba -- proveedor@demo.com 3 5` (con la misma variable FCM) → 3 notificaciones, salida `ok`.
  5. Cerrar sesión en la app → el dispositivo desaparece de `push_devices`.

Anotar resultados. Si el punto 2 falla, **usar superpowers:systematic-debugging** antes de tocar código.

---

### Task 11: 🚨 Despliegue a vps2 con salida a internet para `oficio_api` (requiere OK de Dariel) y APK de prueba para Cuba

**Files:**
- Modify: `oficios-cuba/docker-compose.yml`
- Create: `oficios-cuba/docs/prueba-push-cuba.md`

- [ ] **Step 1: Pedir OK a Dariel explicando el cambio de superficie.** Hoy `oficio_api` está en una red **interna sin salida** (buena defensa: aunque alguien comprometa la API, no puede sacar datos ni descargar nada). FCM exige que la API hable con `oauth2.googleapis.com` y `fcm.googleapis.com`. Propuesta: añadir a `oficio_api` una segunda red `oficio_salida` (bridge normal, sin puertos publicados). Alternativa más estricta (a valorar con él): un contenedor mínimo "emisor de push" con salida, al que la API llama por la red interna. **No desplegar sin su sí explícito.**

Cambio propuesto en `oficios-cuba/docker-compose.yml`, servicio `oficio_api`:
```yaml
    volumes:
      - ./data:/app/data
      - ./secrets/fcm.json:/app/secrets/fcm.json:ro
    environment:
      - NODE_ENV=production
      - PORT=3000
      - DATABASE_PATH=/app/data/oficios.db
      - TZ=America/Havana
      - FCM_SERVICE_ACCOUNT_FILE=/app/secrets/fcm.json
    networks:
      - oficio_net
      - oficio_salida    # solo salida HTTPS hacia Google (FCM); sin puertos publicados
```
y en `networks:` → `oficio_salida: { name: oficio_salida }`. Añadir `secrets/` al `.gitignore` de `oficios-cuba/`.

- [ ] **Step 2: Colocar el secreto en vps2 sin que pase por el chat**
```bash
ssh vps2 'mkdir -p ~/docker/oficio/oficios-cuba/secrets && chmod 700 ~/docker/oficio/oficios-cuba/secrets'
scp ~/.claude/.oficio-fcm.json vps2:docker/oficio/oficios-cuba/secrets/fcm.json
ssh vps2 'chmod 644 ~/docker/oficio/oficios-cuba/secrets/fcm.json && ls -la ~/docker/oficio/oficios-cuba/secrets'   # 644: el usuario node (uid 1000) del contenedor debe poder leerlo; el directorio 700 lo protege en el host
```

- [ ] **Step 3: Desplegar con la skill `oficio-deploy-vps2`** (backup → comprobar si vps2 va por delante → pull → build → verificación). Verificación extra: `docker logs oficio_api | grep "Push FCM activo"`, y `docker exec oficio_api node -e "fetch('https://oauth2.googleapis.com/').then(r=>console.log('salida ok',r.status))"`.

- [ ] **Step 4: APK de prueba (apunta a producción, firma de depuración)**
```bash
cd ~/Documentos/dev/oficio/oficios-cuba/mobile
npx expo prebuild -p android --clean
cd android && ./gradlew assembleRelease && ls -la app/build/outputs/apk/release/
```
Nota para el informe: esta APK usa la firma de depuración; la de producción (Parte 2) tendrá otra firma, así que los testers **tendrán que desinstalar** esta antes de instalar la definitiva.

- [ ] **Step 5: Protocolo para la familia de Doniet** — `oficios-cuba/docs/prueba-push-cuba.md`:
```markdown
# Prueba de notificaciones en Cuba

Objetivo: saber si las notificaciones de Oficios Cuba llegan a un Android dentro de Cuba.

1. Instalar la APK que te envió Doniet (permitir "orígenes desconocidos" si lo pide).
2. Abrir la app → Cuenta → Crear cuenta → "Ofrezco mis servicios". Usa tu email real.
3. Cuando pida permiso para notificaciones, toca **Permitir**.
4. Deja la app cerrada (no hace falta tenerla abierta).
5. Avisa a Doniet del email con el que te registraste.
6. Doniet te enviará 10 notificaciones de prueba, una cada 30 segundos, dos veces:
   - primera tanda con **datos móviles** (WiFi apagado),
   - segunda tanda con **WiFi** (datos apagados).
7. Anota para cada una: número (1–10), hora a la que te llegó (o "no llegó").

| Tanda | # | Hora de llegada |
|---|---|---|
| Datos | 1 | |
| … | … | |
| WiFi | 10 | |

Criterio (spec §6.1): ≥ 9 de 10 en menos de 1 minuto en ambas tandas → FCM sirve.
```
El envío lo hace Dariel/cc con `ssh vps2 'docker exec oficio_api node dist/scripts/push-prueba.js <email> 10 30'`, guardando la salida (hora de envío de cada una) para comparar.

- [ ] **Step 6: STATUS, memoria y commit**
Entrada en `oficios-cuba/STATUS.md` (hora UTC) con lo hecho, resultados de Task 10 y el estado de la prueba en Cuba; actualizar `project_oficio.md` en la memoria.
```bash
cd ~/Documentos/dev/oficio && git add oficios-cuba && git commit -m "Despliegue con push FCM, APK y protocolo de prueba en Cuba" && git push origin master
```

---

## Self-review (hecho al escribir el plan)

- **Cobertura de la spec (Parte 1):** §2 → Tasks 1–3; §3 → 1–2; §5 sesión/token/sondeo → 8 (caché persistida y aviso sin conexión global → Parte 2); §6 push → 4–6, 9–11; §6.1 → 10–11; §8 tests → en cada tarea. §4 completo, §7 release y la versión de app → **Parte 2** (declarado arriba).
- **Tipos consistentes:** `DispositivoPush.canal = 'fcm'` en shared ↔ `z.enum(['fcm'])` en la ruta ↔ `Canal = 'fcm'` en `registro.ts`. `channel_id: 'mensajes'` en `fcm.ts` ↔ `setNotificationChannelAsync('mensajes')` en `push.ts` ↔ `defaultChannel: 'mensajes'` en `app.config.ts`. `datos: { tipo: 'mensaje', conversation_id }` en `avisos.ts` ↔ `rutaDeNotificacion` en `push.ts`.
- **Review Focus:** 1 → Task 5 (test "avisa al PROVEEDOR"); 2 → Task 5 (el remitente no recibe: "avisa al cliente y no al proveedor"); 3 → Task 4 ("token que pasa a otra cuenta"); 4 → Task 5 ("falla o tarda"); 5 → Task 9 ("al salir sin red").
