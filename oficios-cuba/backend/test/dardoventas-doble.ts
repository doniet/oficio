import { v4 as uuidv4 } from 'uuid';
import { q } from '../src/db/acceso.js';
import { ponerPlan, registrar } from './helpers.js';

// Doble del contrato de DardoVentas (spec, «Contrato» y «Precisiones del contrato»). Las pruebas
// le pasan `pedir` al sincronizador en vez de `fetch`: ninguna sale a la red.
export const BASE = 'https://doble.dardoventas.test';

export const art = (uid: string, extra: Record<string, unknown> = {}) => ({
  uid, name: `Artículo ${uid}`, description: null, category: 'Bebidas', priceSource: 'cup',
  priceCup: 250, priceUsd: null, disponible: true, updatedAt: '2026-10-07T00:00:00Z', photoUrl: null, ...extra,
});

export const respuestaCatalogo = (items: unknown[], etag = '"e1"') => new Response(
  JSON.stringify({ schema_version: 1, items }),
  { status: 200, headers: { ETag: etag, 'Content-Type': 'application/json' } },
);

export interface Llamada { url: string; init: RequestInit }

export function pedirFalso(responder: (url: string, init: RequestInit) => Response | Promise<Response>) {
  const llamadas: Llamada[] = [];
  const pedir = (async (url: string | URL | Request, init: RequestInit = {}) => {
    llamadas.push({ url: String(url), init });
    return responder(String(url), init);
  }) as typeof fetch;
  return { pedir, llamadas };
}

export async function negocioVinculado(plan: 'free' | 'basic' | 'pro' = 'pro') {
  const p = await registrar('provider');
  await ponerPlan(p.providerId!, plan);
  const slug = `slug${uuidv4().replace(/-/g, '')}`;
  await q('UPDATE provider_profiles SET dardoventas_slug = $1 WHERE id = $2', [slug, p.providerId]);
  return { ...p, slug, perfil: { id: p.providerId!, dardoventas_slug: slug, dardoventas_etag: null as string | null } };
}
