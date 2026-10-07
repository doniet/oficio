import { execFileSync } from 'child_process';
import { join } from 'path';
import { describe, expect, it } from 'vitest';
import { q, qOne } from '../src/db/acceso.js';
import { leerCatalogo, rutaFoto, sincronizarNegocio, sincronizarPendientes, type ConfigDv } from '../src/notifier/dardoventas.js';
import { api } from './helpers.js';
import { art, BASE, negocioVinculado, pedirFalso, respuestaCatalogo } from './dardoventas-doble.js';

const cfg: ConfigDv = { base: BASE, secreto: 'secreto-de-prueba', proHasta: null };

interface Fila { uid_externo: string; name: string; price: number | null; price_type: string; price_currency: string; section: string | null; available: boolean; image: string | null; origen: string }
const importados = (providerId: string) => q<Fila>(
  `SELECT uid_externo, name, price, price_type, price_currency, section, available, image, origen
     FROM catalog_items WHERE provider_id = $1 AND origen = 'dardoventas' ORDER BY uid_externo`, [providerId],
);
const perfil = (id: string) => qOne<{ dardoventas_slug: string | null; dardoventas_etag: string | null; dardoventas_fallos: number; dardoventas_reintento_en: string | null; dardoventas_synced_at: string | null; show_on_map: boolean }>(
  'SELECT dardoventas_slug, dardoventas_etag, dardoventas_fallos, dardoventas_reintento_en, dardoventas_synced_at, show_on_map FROM provider_profiles WHERE id = $1', [id],
);

describe('rutaFoto', () => {
  const slug = 'abcdefghijklmnop';
  it('traduce la URL del contrato a la ruta local del proxy', () => {
    expect(rutaFoto(`${BASE}/api/pub/foto/${slug}/u1.jpg?v=17`, BASE, slug, 'u1')).toBe(`/ext/dv/foto/${slug}/u1.jpg?v=17`);
  });
  it.each([
    ['otro origen', `https://malo.test/api/pub/foto/${slug}/u1.jpg?v=1`],
    ['otro slug', `${BASE}/api/pub/foto/otroslug12345678/u1.jpg?v=1`],
    ['otro uid', `${BASE}/api/pub/foto/${slug}/u2.jpg?v=1`],
    ['sin versión', `${BASE}/api/pub/foto/${slug}/u1.jpg`],
    ['versión con barra', `${BASE}/api/pub/foto/${slug}/u1.jpg?v=a%2Fb`],
    ['no es URL', 'foto.jpg'],
    ['no es cadena', 42],
  ])('%s → sin foto', (_n, url) => {
    expect(rutaFoto(url, BASE, slug, 'u1')).toBeNull();
  });
});

describe('leerCatalogo', () => {
  it('rechaza otra versión del esquema y JSON roto', () => {
    expect(() => leerCatalogo(JSON.stringify({ schema_version: 2, items: [] }), BASE, 'abcdefghijklmnop')).toThrow();
    expect(() => leerCatalogo('{"schema_version": 1, "items": [', BASE, 'abcdefghijklmnop')).toThrow();
  });
  it('recorta a los topes de la base y cuenta como presente un uid válido aunque el artículo venga roto', () => {
    const r = leerCatalogo(JSON.stringify({ schema_version: 1, items: [
      art('u1', { name: 'x'.repeat(300), category: 'c'.repeat(80), description: 'd'.repeat(2000) }),
      art('u2', { name: '' }),
      art('u3', { priceCup: 'caro' }),
      { uid: 'con espacio', name: 'Malo', disponible: true },
    ] }), BASE, 'abcdefghijklmnop');
    expect(r.presentes.sort()).toEqual(['u1', 'u2', 'u3']);
    expect(r.articulos).toHaveLength(1);
    expect(r.articulos[0].name).toHaveLength(120);
    expect(r.articulos[0].section).toHaveLength(40);
    expect(r.articulos[0].description).toHaveLength(1000);
  });
});

describe('sincronizarNegocio', () => {
  it('200: importa con el precio tal cual, «A consultar» sin precio y la foto por el proxy', async () => {
    const n = await negocioVinculado();
    const { pedir, llamadas } = pedirFalso(() => respuestaCatalogo([
      art('a', { priceCup: 1250.5, photoUrl: `${BASE}/api/pub/foto/${n.slug}/a.jpg?v=9` }),
      art('b', { priceCup: null, disponible: false, category: '  ' }),
    ]));
    expect(await sincronizarNegocio(n.perfil, cfg, pedir)).toBe('actualizado');
    expect(llamadas[0].url).toBe(`${BASE}/api/pub/catalog/${n.slug}`);
    expect(await importados(n.providerId!)).toEqual([
      { uid_externo: 'a', name: 'Artículo a', price: 1250.5, price_type: 'fixed', price_currency: 'CUP', section: 'Bebidas', available: true, image: `/ext/dv/foto/${n.slug}/a.jpg?v=9`, origen: 'dardoventas' },
      { uid_externo: 'b', name: 'Artículo b', price: null, price_type: 'ask', price_currency: 'CUP', section: null, available: false, image: null, origen: 'dardoventas' },
    ]);
    expect((await perfil(n.providerId!))?.dardoventas_etag).toBe('"e1"');
  });

  it('el JSON público conserva la forma que espera la APK 0.2.5', async () => {
    const n = await negocioVinculado();
    const { pedir } = pedirFalso(() => respuestaCatalogo([art('a', { photoUrl: `${BASE}/api/pub/foto/${n.slug}/a.jpg?v=1` })]));
    await sincronizarNegocio(n.perfil, cfg, pedir);
    const [item] = (await api.get(`/api/catalog/provider/${n.providerId}`)).body.items;
    expect(typeof item.id).toBe('string');
    expect(typeof item.name).toBe('string');
    expect(typeof item.price).toBe('number');
    expect(['fixed', 'from', 'ask']).toContain(item.price_type);
    expect(item.price_currency).toBe('CUP');
    expect(item.image.startsWith('/')).toBe(true);
    expect(typeof item.available).toBe('boolean');
  });

  it('una segunda pasada manda If-None-Match y con 304 no toca nada', async () => {
    const n = await negocioVinculado();
    await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => respuestaCatalogo([art('a')])).pedir);
    const antes = await importados(n.providerId!);
    const { pedir, llamadas } = pedirFalso(() => new Response(null, { status: 304 }));
    expect(await sincronizarNegocio({ ...n.perfil, dardoventas_etag: '"e1"' }, cfg, pedir)).toBe('sin_cambios');
    expect(new Headers(llamadas[0].init.headers).get('If-None-Match')).toBe('"e1"');
    expect(await importados(n.providerId!)).toEqual(antes);
  });

  it('lo que ya no viene se borra; lo propio no se toca', async () => {
    const n = await negocioVinculado();
    await q("INSERT INTO catalog_items (id, provider_id, name, created_at) VALUES (gen_random_uuid(), $1, 'Propio', now())", [n.providerId]);
    await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => respuestaCatalogo([art('a'), art('b')])).pedir);
    await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => respuestaCatalogo([art('a', { name: 'Renombrado' })], '"e2"')).pedir);
    expect((await importados(n.providerId!)).map((f) => [f.uid_externo, f.name])).toEqual([['a', 'Renombrado']]);
    expect((await qOne("SELECT 1 FROM catalog_items WHERE provider_id = $1 AND name = 'Propio'", [n.providerId]))).toBeTruthy();
  });

  it('un artículo que llega roto no se borra ni se pisa', async () => {
    const n = await negocioVinculado();
    await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => respuestaCatalogo([art('a'), art('b')])).pedir);
    await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => respuestaCatalogo([art('a'), art('b', { name: '', priceCup: 'x' })], '"e2"')).pedir);
    expect((await importados(n.providerId!)).map((f) => [f.uid_externo, f.name])).toEqual([['a', 'Artículo a'], ['b', 'Artículo b']]);
  });

  it.each([
    ['500', () => new Response('fallo', { status: 500 })],
    ['red caída', () => { throw new TypeError('fetch failed'); }],
    ['esquema desconocido', () => new Response(JSON.stringify({ schema_version: 2, items: [] }), { status: 200 })],
    ['JSON cortado', () => new Response('{"schema_version":1,"items":[', { status: 200 })],
  ])('%s: no vacía el catálogo y programa un reintento', async (_n, responder) => {
    const n = await negocioVinculado();
    await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => respuestaCatalogo([art('a')])).pedir);
    expect(await sincronizarNegocio(n.perfil, cfg, pedirFalso(responder as () => Response).pedir)).toBe('error');
    expect(await importados(n.providerId!)).toHaveLength(1);
    const p = await perfil(n.providerId!);
    expect(p?.dardoventas_fallos).toBe(1);
    expect(p?.dardoventas_reintento_en).not.toBeNull();
  });

  it('una respuesta de más de 5 MB sin Content-Length se corta sin tocar la base', async () => {
    const n = await negocioVinculado();
    await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => respuestaCatalogo([art('a')])).pedir);
    const trozo = new TextEncoder().encode('x'.repeat(1024 * 1024));
    let enviados = 0;
    const enorme = new ReadableStream<Uint8Array>({
      pull(ctrl) { if (enviados++ < 7) ctrl.enqueue(trozo); else ctrl.close(); },
    });
    expect(await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => new Response(enorme, { status: 200 })).pedir)).toBe('error');
    expect(enviados).toBeLessThanOrEqual(7);
    expect(await importados(n.providerId!)).toHaveLength(1);
  });

  it('410: retira los artículos, el vínculo y saca el negocio del mapa', async () => {
    const n = await negocioVinculado();
    await q('UPDATE provider_profiles SET show_on_map = true WHERE id = $1', [n.providerId]);
    await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => respuestaCatalogo([art('a')])).pedir);
    expect(await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => new Response(null, { status: 410 })).pedir)).toBe('baja');
    expect(await importados(n.providerId!)).toHaveLength(0);
    expect(await perfil(n.providerId!)).toMatchObject({ dardoventas_slug: null, show_on_map: false });
  });

  it('si lo desvinculan mientras se descarga, no reimporta nada', async () => {
    const n = await negocioVinculado();
    const { pedir } = pedirFalso(async () => {
      await q('UPDATE provider_profiles SET dardoventas_slug = NULL WHERE id = $1', [n.providerId]);
      return respuestaCatalogo([art('a')]);
    });
    expect(await sincronizarNegocio(n.perfil, cfg, pedir)).toBe('desvinculado');
    expect(await importados(n.providerId!)).toHaveLength(0);
  });

  it('respeta el tope del plan: con Básico se ven 50 y el resto queda oculto', async () => {
    const n = await negocioVinculado('basic');
    const items = Array.from({ length: 60 }, (_, i) => art(`u${String(i).padStart(2, '0')}`));
    await sincronizarNegocio(n.perfil, cfg, pedirFalso(() => respuestaCatalogo(items)).pedir);
    const ocultos = await qOne<{ n: string }>('SELECT count(*) AS n FROM catalog_items WHERE provider_id = $1 AND hidden_by_plan', [n.providerId]);
    expect(Number(ocultos!.n)).toBe(10);
  });
});

describe('sincronizarPendientes', () => {
  it('con el catálogo sin cambios hace UNA petición cada 30 min, no una por vuelta', async () => {
    await q('UPDATE provider_profiles SET dardoventas_slug = NULL');
    const n = await negocioVinculado();
    const { pedir, llamadas } = pedirFalso((_url, init) => (new Headers(init.headers).get('If-None-Match')
      ? new Response(null, { status: 304 }) : respuestaCatalogo([art('a')])));
    expect(await sincronizarPendientes(cfg, pedir)).toBe(1);
    expect(await sincronizarPendientes(cfg, pedir)).toBe(0);
    await q("UPDATE provider_profiles SET dardoventas_synced_at = now() - interval '31 minutes' WHERE id = $1", [n.providerId]);
    expect(await sincronizarPendientes(cfg, pedir)).toBe(1);
    expect(llamadas).toHaveLength(2);
    expect(new Headers(llamadas[1].init.headers).get('If-None-Match')).toBe('"e1"');
  });

  it('no insiste con un negocio que está en reintento', async () => {
    await q('UPDATE provider_profiles SET dardoventas_slug = NULL');
    const n = await negocioVinculado();
    await q("UPDATE provider_profiles SET dardoventas_reintento_en = now() + interval '5 minutes' WHERE id = $1", [n.providerId]);
    const { pedir, llamadas } = pedirFalso(() => respuestaCatalogo([]));
    await sincronizarPendientes(cfg, pedir);
    expect(llamadas).toHaveLength(0);
  });
});

describe('aislamiento del notificador', () => {
  it('notifier/dardoventas.ts se carga sin JWT_SECRET (no arrastra config.ts)', () => {
    const backend = join(__dirname, '..');
    expect(() => execFileSync('npx', ['tsx', '-e', "require('./src/notifier/dardoventas.ts')"], {
      cwd: backend,
      env: { PATH: process.env.PATH, HOME: process.env.HOME, NODE_ENV: 'production', DATABASE_URL: 'postgresql://x:x@127.0.0.1:1/x' },
      stdio: 'pipe',
    })).not.toThrow();
  });
});
