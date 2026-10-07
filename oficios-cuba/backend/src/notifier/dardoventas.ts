import { existsSync, readFileSync } from 'fs';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { desvincular, regalarPro } from '../db/dardoventas.js';
import { aplicarLimiteDePlan } from '../db/limite-plan.js';
import { q, tx } from './db.js';

// Catálogo de DardoVentas (docs/superpowers/specs/2026-10-06-dardoventas-catalogo-design.md). Vive en
// el notificador porque es el único proceso con salida a internet. Un fallo del otro lado nunca
// vacía un catálogo: lo único que borra artículos es un 200 válido que ya no los trae, o un 410.

export interface ConfigDv {
  /** Origen de DardoVentas, sin barra final. */
  base: string;
  /** Secreto compartido del canje. null = canje apagado. */
  secreto: string | null;
  /** Fin del Profesional regalado. null = no se regala. */
  proHasta: Date | null;
}

export type Pedir = typeof fetch;

export const PERIODO_MIN = 30;
export const MAX_BYTES = 5 * 1024 * 1024;
export const MAX_ARTICULOS = 5000;
export const SLUG = /^[A-Za-z0-9_-]{16,64}$/;
const UID = /^[A-Za-z0-9_-]{1,64}$/;
const VERSION_FOTO = /^[A-Za-z0-9_-]{1,32}$/;

export interface ArticuloImportado {
  uid: string;
  name: string;
  description: string | null;
  section: string | null;
  price: number | null;
  available: boolean;
  image: string | null;
}

const raizDv = z.object({
  schema_version: z.literal(1),
  items: z.array(z.unknown()).max(MAX_ARTICULOS),
});

// Postgres rechaza el NUL en un text: un solo artículo con \u0000 tumbaría la transacción entera.
const sinNul = z.string().transform((t) => t.replace(/\u0000/g, ''));

// Lista blanca: lo que no se nombra aquí no entra, aunque DardoVentas lo mande.
const articuloDv = z.object({
  uid: z.string().regex(UID),
  name: sinNul.pipe(z.string().trim().min(1)),
  description: sinNul.nullish(),
  category: sinNul.nullish(),
  priceCup: z.number().finite().min(0).max(100_000_000).nullish(),
  disponible: z.boolean(),
  photoUrl: z.unknown(),
});

const corta = (s: string | null | undefined, max: number) => {
  const t = s?.trim();
  return t ? t.slice(0, max) : null;
};

/** La URL de la foto del contrato → la ruta local que sirve el proxy de oficio_web. Otra forma = sin foto. */
export function rutaFoto(url: unknown, base: string, slug: string, uid: string): string | null {
  if (typeof url !== 'string') return null;
  let u: URL;
  try { u = new URL(url); } catch { return null; }
  if (u.origin !== new URL(base).origin || u.pathname !== `/api/pub/foto/${slug}/${uid}.jpg`) return null;
  const v = u.searchParams.get('v');
  return v && VERSION_FOTO.test(v) ? `/ext/dv/foto/${slug}/${uid}.jpg?v=${v}` : null;
}

// 5 MB de texto caben en la cota de bytes pero no en la de memoria: millones de `{}` o `[]` diminutos
// ocupan >100 MB al parsearse y el contenedor tiene 128. Contar aperturas fuera de cadenas es barato
// y se hace ANTES de JSON.parse. Un catálogo legítimo tiene ~1 objeto por artículo.
const MAX_ESTRUCTURAS = MAX_ARTICULOS * 2 + 16;

function comprobarEstructura(texto: string) {
  let dentro = false;
  let escapado = false;
  let abiertas = 0;
  for (let i = 0; i < texto.length; i++) {
    const ch = texto.charCodeAt(i);
    if (dentro) {
      if (escapado) escapado = false;
      else if (ch === 92) escapado = true; // \
      else if (ch === 34) dentro = false; // "
    } else if (ch === 34) dentro = true;
    else if ((ch === 123 || ch === 91) && ++abiertas > MAX_ESTRUCTURAS) throw new Error('catálogo con demasiada estructura');
  }
}

/**
 * Lanza si la raíz no vale (y entonces la pasada no toca nada). Un artículo roto se ignora, pero si
 * su uid es válido cuenta como presente: que venga mal no significa que lo hayan quitado.
 */
export function leerCatalogo(texto: string, base: string, slug: string) {
  comprobarEstructura(texto);
  const raiz = raizDv.parse(JSON.parse(texto));
  const presentes = new Set<string>();
  const articulos: ArticuloImportado[] = [];
  for (const crudo of raiz.items) {
    const uid = (crudo as { uid?: unknown } | null)?.uid;
    if (typeof uid === 'string' && UID.test(uid)) presentes.add(uid);
    const r = articuloDv.safeParse(crudo);
    if (!r.success) continue;
    const a = r.data;
    articulos.push({
      uid: a.uid,
      name: a.name.slice(0, 120),
      description: corta(a.description, 1000),
      section: corta(a.category, 40),
      price: a.priceCup ?? null,
      available: a.disponible,
      image: rutaFoto(a.photoUrl, base, slug, a.uid),
    });
  }
  return { presentes: [...presentes], articulos };
}

// El notificador tiene 128 MB: se lee por trozos y se corta en cuanto pasa del tope, venga o no
// Content-Length (que con gzip es el tamaño comprimido, así que solo sirve para cortar antes).
async function leerConTope(res: Response, max: number) {
  if (Number(res.headers.get('content-length')) > max) throw new Error('catálogo demasiado grande');
  if (!res.body) return '';
  const lector = res.body.getReader();
  const trozos: Uint8Array[] = [];
  let total = 0;
  for (;;) {
    const { done, value } = await lector.read();
    if (done) break;
    total += value.byteLength;
    if (total > max) {
      await lector.cancel();
      throw new Error('catálogo demasiado grande');
    }
    trozos.push(value);
  }
  return Buffer.concat(trozos).toString('utf8');
}

// Solo si sigue vinculado con ese slug: un perfil ya desvinculado no debe quedar marcado.
// En el SET, dardoventas_fallos es todavía el valor viejo: 5, 10, 20… minutos, tope 6 h.
async function programarReintento(id: string, slug: string) {
  await q(
    `UPDATE provider_profiles SET dardoventas_fallos = dardoventas_fallos + 1,
       dardoventas_reintento_en = now() + make_interval(mins => LEAST(360, 5 * power(2, LEAST(dardoventas_fallos, 7))::int))
     WHERE id = $1 AND dardoventas_slug = $2`,
    [id, slug],
  );
}

async function anotarFallo(id: string, slug: string, motivo: string) {
  console.error(`dardoventas ${id}: ${motivo}`);
  await programarReintento(id, slug);
}

type PerfilDv = { id: string; dardoventas_slug: string; dardoventas_etag: string | null };

export async function sincronizarNegocio(p: PerfilDv, cfg: ConfigDv, pedir: Pedir = fetch) {
  let res: Response;
  try {
    res = await pedir(`${cfg.base}/api/pub/catalog/${encodeURIComponent(p.dardoventas_slug)}`, {
      redirect: 'error', // un 3xx desde fuera sería SSRF ciego hacia net_dmz o una bajada a http
      headers: { Accept: 'application/json', ...(p.dardoventas_etag ? { 'If-None-Match': p.dardoventas_etag } : {}) },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    await anotarFallo(p.id, p.dardoventas_slug, `red: ${(err as Error).message}`);
    return 'error' as const;
  }

  if (res.status === 304) {
    await q(
      `UPDATE provider_profiles SET dardoventas_synced_at = now(), dardoventas_fallos = 0, dardoventas_reintento_en = NULL
       WHERE id = $1 AND dardoventas_slug = $2`,
      [p.id, p.dardoventas_slug],
    );
    return 'sin_cambios' as const;
  }

  if (res.status === 410) {
    await tx(async (c) => {
      const vigente = await c.qOne('SELECT 1 FROM provider_profiles WHERE id = $1 AND dardoventas_slug = $2 FOR UPDATE', [p.id, p.dardoventas_slug]);
      if (vigente) await desvincular(c, p.id, true);
    });
    return 'baja' as const;
  }

  if (res.status !== 200) {
    await res.body?.cancel().catch(() => {});
    await anotarFallo(p.id, p.dardoventas_slug, `HTTP ${res.status}`);
    return 'error' as const;
  }

  // Penalización por adelantado: si leer o parsear este cuerpo mata el proceso (memoria), al
  // reiniciar el negocio ya está en reintento y no vuelve a ser el primero de la cola. El éxito
  // la borra; los fallos de aquí en adelante solo se registran, ya están anotados.
  await programarReintento(p.id, p.dardoventas_slug);

  let leido: ReturnType<typeof leerCatalogo>;
  try {
    leido = leerCatalogo(await leerConTope(res, MAX_BYTES), cfg.base, p.dardoventas_slug);
  } catch (err) {
    console.error(`dardoventas ${p.id}: catálogo ilegible: ${(err as Error).message}`);
    return 'error' as const;
  }

  const etagCrudo = res.headers.get('etag');
  const etag = etagCrudo && etagCrudo.length <= 256 ? etagCrudo : null;
  // Una transacción por negocio, no una global: no bloquea la tabla durante toda la pasada.
  let hecho: boolean;
  try {
    hecho = await tx(async (c) => {
      // Pudieron desvincularlo mientras se descargaba: entonces no se reimporta nada.
      const vigente = await c.qOne('SELECT 1 FROM provider_profiles WHERE id = $1 AND dardoventas_slug = $2 FOR UPDATE', [p.id, p.dardoventas_slug]);
      if (!vigente) return false;
      const ahora = new Date().toISOString();
      for (const a of leido.articulos) {
        await c.q(
          `INSERT INTO catalog_items (id, provider_id, origen, uid_externo, name, description, price, price_type, price_currency, image, section, available, created_at)
           VALUES ($1, $2, 'dardoventas', $3, $4, $5, $6, $7, 'CUP', $8, $9, $10, $11)
           ON CONFLICT (provider_id, uid_externo) WHERE uid_externo IS NOT NULL DO UPDATE SET
             name = EXCLUDED.name, description = EXCLUDED.description, price = EXCLUDED.price,
             price_type = EXCLUDED.price_type, price_currency = 'CUP', image = EXCLUDED.image,
             section = EXCLUDED.section, available = EXCLUDED.available, updated_at = EXCLUDED.created_at`,
          [uuidv4(), p.id, a.uid, a.name, a.description, a.price, a.price == null ? 'ask' : 'fixed', a.image, a.section, a.available, ahora],
        );
      }
      await c.q(
        `DELETE FROM catalog_items WHERE provider_id = $1 AND origen = 'dardoventas' AND NOT (uid_externo = ANY($2::text[]))`,
        [p.id, leido.presentes],
      );
      await c.q(
        `UPDATE provider_profiles SET dardoventas_etag = $2, dardoventas_synced_at = now(), dardoventas_fallos = 0,
           dardoventas_reintento_en = NULL WHERE id = $1`,
        [p.id, etag],
      );
      await aplicarLimiteDePlan(c, p.id);
      return true;
    });
  } catch (err) {
    // La penalización ya está anotada: no se vuelve a sumar. Se conserva lo importado.
    console.error(`dardoventas ${p.id}: no se pudo guardar: ${(err as Error).message}`);
    return 'error' as const;
  }
  return hecho ? 'actualizado' as const : 'desvinculado' as const;
}

/** Una vuelta: los negocios vinculados que llevan más de PERIODO_MIN sin sondear y no están en reintento. */
export async function sincronizarPendientes(cfg: ConfigDv, pedir: Pedir = fetch) {
  const perfiles = await q<PerfilDv>(
    `SELECT id, dardoventas_slug, dardoventas_etag FROM provider_profiles
      WHERE dardoventas_slug IS NOT NULL
        AND (dardoventas_reintento_en IS NULL OR dardoventas_reintento_en <= now())
        AND (dardoventas_synced_at IS NULL OR dardoventas_synced_at < now() - make_interval(mins => $1))
      ORDER BY dardoventas_synced_at NULLS FIRST
      LIMIT 20`,
    [PERIODO_MIN],
  );
  for (const p of perfiles) {
    // Un negocio que lance no puede cortar la vuelta de los demás, ni quedarse el primero de la cola.
    try { await sincronizarNegocio(p, cfg, pedir); } catch (err) {
      console.error(`dardoventas ${p.id}: ${(err as Error).message}`);
      await programarReintento(p.id, p.dardoventas_slug).catch(() => {});
    }
  }
  return perfiles.length;
}

export const TTL_CODIGO_MIN = 15;

export const MSG = {
  caducado: 'El código caducó. Vuelve a mi.dardoventas.com y pide uno nuevo.',
  apagado: 'La conexión con DardoVentas todavía no está activa. Prueba más tarde.',
  codigo: 'DardoVentas no reconoce ese código o ya se usó. Pide uno nuevo en mi.dardoventas.com.',
  red: 'No pudimos hablar con DardoVentas. Prueba otra vez dentro de unos minutos.',
  otraCuenta: 'Ese negocio de DardoVentas ya está conectado con otra cuenta de Encuentrauno.',
  yaVinculado: 'Tu negocio ya está conectado con DardoVentas.',
} as const;

/** El secreto se lee de un archivo (montado solo en este contenedor), nunca de una variable. */
export function configDv(env: NodeJS.ProcessEnv = process.env): ConfigDv {
  const archivo = env.DARDOVENTAS_SECRETO_FILE;
  const secreto = archivo && existsSync(archivo) ? readFileSync(archivo, 'utf8').trim() || null : null;
  const hasta = env.DARDOVENTAS_PRO_HASTA ? new Date(env.DARDOVENTAS_PRO_HASTA) : null;
  return {
    base: (env.DARDOVENTAS_URL || 'https://ventas.dardoit.com').replace(/\/+$/, ''),
    secreto,
    proHasta: hasta && !Number.isNaN(hasta.getTime()) ? hasta : null,
  };
}

const respuestaCanje = z.object({
  ok: z.literal(true),
  slug: z.string().regex(SLUG),
  // PUT /me/profile admite 80 como máximo: un nombre largo se recorta, no tumba el canje.
  businessName: sinNul.nullish().transform((t) => corta(t, 80)),
});

// El código no se guarda más de lo necesario: se borra al terminar, salga bien o mal.
// Solo cierra un canje todavía pendiente: uno sustituido o caducado mientras esperaba a DardoVentas
// ya tiene su estado final y no se pisa.
async function terminar(id: string, error: string | null) {
  await q(
    "UPDATE dardoventas_canjes SET status = $2, error = $3, code = NULL, done_at = now() WHERE id = $1 AND status = 'pendiente'",
    [id, error ? 'error' : 'ok', error],
  );
}

const OMITIR = Symbol('canje ya cerrado');

async function canjear(k: { id: string; provider_id: string; code: string }, cfg: ConfigDv, pedir: Pedir) {
  if (!cfg.secreto) return terminar(k.id, MSG.apagado);
  let res: Response;
  try {
    res = await pedir(`${cfg.base}/api/pub/link`, {
      method: 'POST',
      redirect: 'error', // misma razón que en el catálogo: un 3xx desde fuera sería SSRF hacia net_dmz
      headers: { 'Content-Type': 'application/json', Authorization: `Bearer ${cfg.secreto}` },
      body: JSON.stringify({ code: k.code }),
      signal: AbortSignal.timeout(10_000),
    });
  } catch (err) {
    console.error(`dardoventas canje: ${(err as Error).name}: ${(err as Error).message}`);
    return terminar(k.id, MSG.red);
  }
  if ([400, 404, 409, 410].includes(res.status)) {
    await res.body?.cancel().catch(() => {});
    return terminar(k.id, MSG.codigo);
  }
  if (res.status === 401) console.error('dardoventas: el secreto del canje no vale (401)');
  if (res.status !== 200) {
    await res.body?.cancel().catch(() => {});
    return terminar(k.id, MSG.red);
  }
  const r = respuestaCanje.safeParse(await res.json().catch(() => null));
  if (!r.success) return terminar(k.id, MSG.red);

  const { slug, businessName } = r.data;
  const error = await tx(async (c) => {
    // El estado leído antes de esperar a DardoVentas puede haber caducado: se vuelve a mirar con el
    // perfil y el canje bloqueados (perfil primero, el mismo orden que la API, para no abrazarse).
    const perfil = await c.qOne<{ dardoventas_slug: string | null }>(
      'SELECT dardoventas_slug FROM provider_profiles WHERE id = $1 FOR UPDATE', [k.provider_id],
    );
    const vigente = await c.qOne<{ status: string }>('SELECT status FROM dardoventas_canjes WHERE id = $1 FOR UPDATE', [k.id]);
    if (vigente?.status !== 'pendiente') return OMITIR;
    if (!perfil) return MSG.red;
    if (perfil.dardoventas_slug) return MSG.yaVinculado;
    if (await c.qOne('SELECT 1 FROM provider_profiles WHERE dardoventas_slug = $1 AND id <> $2', [slug, k.provider_id])) {
      return MSG.otraCuenta;
    }
    await c.q(
      `UPDATE provider_profiles SET dardoventas_slug = $2, dardoventas_linked_at = now(), dardoventas_etag = NULL,
         dardoventas_synced_at = NULL, dardoventas_fallos = 0, dardoventas_reintento_en = NULL,
         kind = 'negocio', business_name = COALESCE(NULLIF(business_name, ''), $3), updated_at = now()
       WHERE id = $1`,
      [k.provider_id, slug, businessName ?? null],
    );
    // Una sola vez por negocio de DardoVentas, aunque cambie de cuenta. Con el regalo apagado o vencido
    // no se anota nada: uno configurado después aún puede aplicarse.
    if (cfg.proHasta && cfg.proHasta > new Date()) {
      const nuevo = await c.qOne(
        'INSERT INTO dardoventas_regalos (slug, provider_id) VALUES ($1, $2) ON CONFLICT (slug) DO NOTHING RETURNING slug',
        [slug, k.provider_id],
      );
      if (nuevo) await regalarPro(c, k.provider_id, cfg.proHasta);
    }
    return null;
  });
  if (error === OMITIR) return;
  await terminar(k.id, error);
  if (error) return;
  // El vínculo ya está guardado: si la primera pasada falla, la pasada regular lo reintenta.
  try {
    await sincronizarNegocio({ id: k.provider_id, dardoventas_slug: slug, dardoventas_etag: null }, cfg, pedir);
  } catch (err) {
    console.error(`dardoventas ${k.provider_id}: primera sincronización: ${(err as Error).message}`);
  }
}

export async function canjearPendientes(cfg: ConfigDv, pedir: Pedir = fetch) {
  await q(
    `UPDATE dardoventas_canjes SET status = 'error', error = $1, code = NULL, done_at = now()
     WHERE status = 'pendiente' AND created_at < now() - make_interval(mins => $2)`,
    [MSG.caducado, TTL_CODIGO_MIN],
  );
  const pendientes = await q<{ id: string; provider_id: string; code: string }>(
    "SELECT id, provider_id, code FROM dardoventas_canjes WHERE status = 'pendiente' ORDER BY created_at LIMIT 10",
  );
  for (const k of pendientes) {
    // Un canje que lance no puede dejar sin atender a los demás.
    try { await canjear(k, cfg, pedir); } catch (err) {
      console.error(`dardoventas canje ${k.id}: ${(err as Error).message}`);
      await terminar(k.id, MSG.red).catch(() => {});
    }
  }
}
