import { mkdtempSync, writeFileSync } from 'fs';
import { tmpdir } from 'os';
import { join } from 'path';
import { beforeEach, describe, expect, it } from 'vitest';
import { q, qOne } from '../src/db/acceso.js';
import { canjearPendientes, configDv, MSG, type ConfigDv } from '../src/notifier/dardoventas.js';
import { api, ponerPlan, registrar } from './helpers.js';
import { art, BASE, pedirFalso, respuestaCatalogo } from './dardoventas-doble.js';

const CODIGO = 'codigo-de-prueba-1234567890';
const hasta = new Date(Date.now() + 90 * 86_400_000);
const cfg: ConfigDv = { base: BASE, secreto: 'secreto-de-prueba', proHasta: hasta };
const slugNuevo = () => `slug${Math.random().toString(36).slice(2).padEnd(14, '0')}`;

// Cada prueba empieza sin canjes pendientes de las anteriores: canjearPendientes los procesa todos.
beforeEach(async () => { await q("UPDATE dardoventas_canjes SET status = 'error', code = NULL WHERE status = 'pendiente'"); });

const canje = (id: string) => qOne<{ status: string; error: string | null; code: string | null }>(
  'SELECT status, error, code FROM dardoventas_canjes WHERE id = $1', [id],
);
const perfil = (id: string) => qOne<{ dardoventas_slug: string | null; kind: string; business_name: string | null; subscription_plan: string; subscription_expires_at: string | null }>(
  'SELECT dardoventas_slug, kind, business_name, subscription_plan, subscription_expires_at FROM provider_profiles WHERE id = $1', [id],
);

/** Doble de DardoVentas: el canje devuelve `slug`; el catálogo, un artículo. */
function dobleCanje(slug: string, estado = 200) {
  return pedirFalso((url) => {
    if (url.endsWith('/api/pub/link')) {
      return estado === 200
        ? Response.json({ ok: true, slug, businessName: 'Cafetería La Esquina' })
        : new Response('{}', { status: estado });
    }
    return respuestaCatalogo([art('a')]);
  });
}

async function pedirVinculo() {
  const p = await registrar('provider');
  const r = await api.post('/api/dardoventas/vincular').set(p.auth).send({ code: CODIGO });
  expect(r.status).toBe(202);
  return { ...p, canjeId: r.body.id as string };
}

describe('API: apuntar el canje', () => {
  it('solo un proveedor con sesión, y con un código bien formado', async () => {
    const cli = await registrar('client');
    expect((await api.post('/api/dardoventas/vincular').send({ code: CODIGO })).status).toBe(401);
    expect((await api.post('/api/dardoventas/vincular').set(cli.auth).send({ code: CODIGO })).status).toBe(403);
    const p = await registrar('provider');
    expect((await api.post('/api/dardoventas/vincular').set(p.auth).send({ code: 'a b' })).status).toBe(400);
    expect((await api.post('/api/dardoventas/vincular').set(p.auth).send({ code: 'x'.repeat(200) })).status).toBe(400);
    expect((await api.post('/api/dardoventas/vincular').set(p.auth).send({ code: 'x'.repeat(21) })).status).toBe(400);
    expect((await api.post('/api/dardoventas/vincular').set(p.auth).send({ code: 'x'.repeat(22) })).status).toBe(202);
  });

  it('un código nuevo sustituye al pendiente anterior', async () => {
    const { auth, canjeId } = await pedirVinculo();
    const otro = await api.post('/api/dardoventas/vincular').set(auth).send({ code: `${CODIGO}-2` });
    expect((await canje(canjeId))?.status).toBe('error');
    expect((await canje(canjeId))?.code).toBeNull();
    expect((await canje(otro.body.id))?.status).toBe('pendiente');
  });

  it('409 si ya está vinculado; 429 al undécimo intento en una hora', async () => {
    const p = await registrar('provider');
    for (let i = 0; i < 10; i++) {
      expect((await api.post('/api/dardoventas/vincular').set(p.auth).send({ code: `${CODIGO}-${i}` })).status).toBe(202);
    }
    expect((await api.post('/api/dardoventas/vincular').set(p.auth).send({ code: CODIGO })).status).toBe(429);
    await q('UPDATE provider_profiles SET dardoventas_slug = $1 WHERE id = $2', [slugNuevo(), p.providerId]);
    expect((await api.post('/api/dardoventas/vincular').set(p.auth).send({ code: CODIGO })).status).toBe(409);
  });

  it('estado: refleja el canje y el vínculo', async () => {
    const { auth, canjeId } = await pedirVinculo();
    const r = await api.get('/api/dardoventas/estado').set(auth);
    expect(r.body).toEqual({ vinculado: false, linked_at: null, synced_at: null, articulos: 0, canje: { id: canjeId, status: 'pendiente', error: null } });
  });

  it('desvincular desde el panel quita lo importado y deja lo propio', async () => {
    const { auth, providerId } = await pedirVinculo();
    await canjearPendientes(cfg, dobleCanje(slugNuevo()).pedir);
    await api.post('/api/catalog').set(auth).send({ name: 'Propio', price: 1 });
    expect((await api.delete('/api/dardoventas/vincular').set(auth)).status).toBe(200);
    const nombres = (await q<{ name: string }>('SELECT name FROM catalog_items WHERE provider_id = $1', [providerId])).map((r) => r.name);
    expect(nombres).toEqual(['Propio']);
    expect((await api.get('/api/dardoventas/estado').set(auth)).body.vinculado).toBe(false);
  });
});

describe('notificador: canjear', () => {
  it('canje bueno: guarda el slug, lo marca negocio, regala el plan e importa el catálogo', async () => {
    const { providerId, canjeId } = await pedirVinculo();
    const slug = slugNuevo();
    const { pedir, llamadas } = dobleCanje(slug);
    await canjearPendientes(cfg, pedir);

    const link = llamadas.find((l) => l.url === `${BASE}/api/pub/link`)!;
    expect(new Headers(link.init.headers).get('Authorization')).toBe('Bearer secreto-de-prueba');
    expect(JSON.parse(String(link.init.body))).toEqual({ code: CODIGO });
    expect(link.init.redirect).toBe('error');

    expect(await canje(canjeId)).toEqual({ status: 'ok', error: null, code: null });
    const p = await perfil(providerId!);
    expect(p).toMatchObject({ dardoventas_slug: slug, kind: 'negocio', subscription_plan: 'pro' });
    expect(new Date(p!.subscription_expires_at!).getTime()).toBe(hasta.getTime());
    expect(llamadas.some((l) => l.url === `${BASE}/api/pub/catalog/${slug}`)).toBe(true);
    expect(await qOne("SELECT 1 FROM catalog_items WHERE provider_id = $1 AND origen = 'dardoventas'", [providerId])).toBeTruthy();
  });

  it('el nombre del negocio solo se rellena si el perfil no tenía', async () => {
    const { providerId } = await pedirVinculo();
    await q("UPDATE provider_profiles SET business_name = 'Mi nombre' WHERE id = $1", [providerId]);
    await canjearPendientes(cfg, dobleCanje(slugNuevo()).pedir);
    expect((await perfil(providerId!))?.business_name).toBe('Mi nombre');
  });

  it('código rechazado por DardoVentas: error claro y el código se borra', async () => {
    const { providerId, canjeId } = await pedirVinculo();
    await canjearPendientes(cfg, dobleCanje(slugNuevo(), 404).pedir);
    expect(await canje(canjeId)).toEqual({ status: 'error', error: MSG.codigo, code: null });
    expect((await perfil(providerId!))?.dardoventas_slug).toBeNull();
  });

  it('código caducado (más de 15 min): error sin llamar a DardoVentas', async () => {
    const { canjeId } = await pedirVinculo();
    await q("UPDATE dardoventas_canjes SET created_at = now() - interval '16 minutes' WHERE id = $1", [canjeId]);
    const { pedir, llamadas } = dobleCanje(slugNuevo());
    await canjearPendientes(cfg, pedir);
    expect((await canje(canjeId))?.error).toBe(MSG.caducado);
    expect(llamadas).toHaveLength(0);
  });

  it('sin secreto configurado: error sin llamar', async () => {
    const { canjeId } = await pedirVinculo();
    const { pedir, llamadas } = dobleCanje(slugNuevo());
    await canjearPendientes({ ...cfg, secreto: null }, pedir);
    expect((await canje(canjeId))?.error).toBe(MSG.apagado);
    expect(llamadas).toHaveLength(0);
  });

  it('un negocio de DardoVentas no se vincula a dos cuentas', async () => {
    const slug = slugNuevo();
    const primero = await pedirVinculo();
    await canjearPendientes(cfg, dobleCanje(slug).pedir);
    const segundo = await pedirVinculo();
    await canjearPendientes(cfg, dobleCanje(slug).pedir);
    expect((await canje(segundo.canjeId))?.error).toBe(MSG.otraCuenta);
    expect((await perfil(segundo.providerId!))?.dardoventas_slug).toBeNull();
    expect((await perfil(primero.providerId!))?.dardoventas_slug).toBe(slug);
  });

  it('con el regalo ya vencido se vincula pero no se toca el plan', async () => {
    const { providerId } = await pedirVinculo();
    await ponerPlan(providerId!, 'basic', null);
    await canjearPendientes({ ...cfg, proHasta: new Date(Date.now() - 1000) }, dobleCanje(slugNuevo()).pedir);
    expect(await perfil(providerId!)).toMatchObject({ subscription_plan: 'basic', subscription_expires_at: null });
  });
});

describe('notificador: carreras con un canje en vuelo', () => {
  it('un código nuevo llegado durante el canje lo deja sustituido: no vincula ni pisa el error', async () => {
    const { auth, providerId, canjeId } = await pedirVinculo();
    const slug = slugNuevo();
    let segundo: { body: { id: string } } | undefined;
    const { pedir } = pedirFalso(async (url) => {
      if (url.endsWith('/api/pub/link')) {
        segundo = await api.post('/api/dardoventas/vincular').set(auth).send({ code: `${CODIGO}-2` });
        return Response.json({ ok: true, slug });
      }
      return respuestaCatalogo([art('a')]);
    });
    await canjearPendientes(cfg, pedir);
    expect(await canje(canjeId)).toMatchObject({ status: 'error', error: 'Sustituido por un código más nuevo.', code: null });
    expect((await perfil(providerId!))?.dardoventas_slug).toBeNull();
    // El segundo sigue pendiente y es el que cuenta.
    expect((await canje(segundo!.body.id))?.status).toBe('pendiente');
  });

  it('si el perfil se vinculó mientras tanto, el canje termina con error y no cambia el vínculo', async () => {
    const { providerId, canjeId } = await pedirVinculo();
    const otro = slugNuevo();
    const { pedir } = pedirFalso(async (url) => {
      if (url.endsWith('/api/pub/link')) {
        await q('UPDATE provider_profiles SET dardoventas_slug = $1 WHERE id = $2', [otro, providerId]);
        return Response.json({ ok: true, slug: slugNuevo() });
      }
      return respuestaCatalogo([art('a')]);
    });
    await canjearPendientes(cfg, pedir);
    expect(await canje(canjeId)).toEqual({ status: 'error', error: MSG.yaVinculado, code: null });
    expect((await perfil(providerId!))?.dardoventas_slug).toBe(otro);
  });
});

describe('configDv', () => {
  it('lee el secreto de un archivo y nunca del entorno', () => {
    const dir = mkdtempSync(join(tmpdir(), 'dv-'));
    writeFileSync(join(dir, 'secreto'), '  s3creto\n');
    const c = configDv({ DARDOVENTAS_SECRETO_FILE: join(dir, 'secreto'), DARDOVENTAS_PRO_HASTA: '2027-03-31', DARDOVENTAS_URL: 'https://x.test/' });
    expect(c).toEqual({ base: 'https://x.test', secreto: 's3creto', proHasta: new Date('2027-03-31') });
    expect(configDv({ DARDOVENTAS_SECRETO: 'no-se-lee' }).secreto).toBeNull();
    expect(configDv({ DARDOVENTAS_PRO_HASTA: 'mañana' }).proHasta).toBeNull();
    expect(configDv({}).base).toBe('https://ventas.dardoit.com');
  });
});
