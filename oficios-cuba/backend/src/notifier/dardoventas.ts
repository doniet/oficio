import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { desvincular } from '../db/dardoventas.js';
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

// Lista blanca: lo que no se nombra aquí no entra, aunque DardoVentas lo mande.
const articuloDv = z.object({
  uid: z.string().regex(UID),
  name: z.string().trim().min(1),
  description: z.string().nullish(),
  category: z.string().nullish(),
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

/**
 * Lanza si la raíz no vale (y entonces la pasada no toca nada). Un artículo roto se ignora, pero si
 * su uid es válido cuenta como presente: que venga mal no significa que lo hayan quitado.
 */
export function leerCatalogo(texto: string, base: string, slug: string) {
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

async function anotarFallo(id: string, motivo: string) {
  console.error(`dardoventas ${id}: ${motivo}`);
  // En el SET, dardoventas_fallos es todavía el valor viejo: 5, 10, 20… minutos, tope 6 h.
  await q(
    `UPDATE provider_profiles SET dardoventas_fallos = dardoventas_fallos + 1,
       dardoventas_reintento_en = now() + make_interval(mins => LEAST(360, 5 * power(2, LEAST(dardoventas_fallos, 7))::int))
     WHERE id = $1`,
    [id],
  );
}

type PerfilDv = { id: string; dardoventas_slug: string; dardoventas_etag: string | null };

export async function sincronizarNegocio(p: PerfilDv, cfg: ConfigDv, pedir: Pedir = fetch) {
  let res: Response;
  try {
    res = await pedir(`${cfg.base}/api/pub/catalog/${encodeURIComponent(p.dardoventas_slug)}`, {
      headers: { Accept: 'application/json', ...(p.dardoventas_etag ? { 'If-None-Match': p.dardoventas_etag } : {}) },
      signal: AbortSignal.timeout(20_000),
    });
  } catch (err) {
    await anotarFallo(p.id, `red: ${(err as Error).message}`);
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
    await anotarFallo(p.id, `HTTP ${res.status}`);
    return 'error' as const;
  }

  let leido: ReturnType<typeof leerCatalogo>;
  try {
    leido = leerCatalogo(await leerConTope(res, MAX_BYTES), cfg.base, p.dardoventas_slug);
  } catch (err) {
    await anotarFallo(p.id, `catálogo ilegible: ${(err as Error).message}`);
    return 'error' as const;
  }

  const etag = res.headers.get('etag');
  // Una transacción por negocio, no una global: no bloquea la tabla durante toda la pasada.
  const hecho = await tx(async (c) => {
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
  for (const p of perfiles) await sincronizarNegocio(p, cfg, pedir);
  return perfiles.length;
}
