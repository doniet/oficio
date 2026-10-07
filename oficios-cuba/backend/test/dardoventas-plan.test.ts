import { describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { q, qOne, tx } from '../src/db/acceso.js';
import { desvincular, regalarPro } from '../src/db/dardoventas.js';
import { expireSubscriptions } from '../src/db/index.js';
import { ponerPlan, registrar } from './helpers.js';

const plan = (id: string) => qOne<{ subscription_plan: string; subscription_expires_at: string | null }>(
  'SELECT subscription_plan, subscription_expires_at FROM provider_profiles WHERE id = $1', [id],
);
const dentroDe = (dias: number) => new Date(Date.now() + dias * 86_400_000);

async function meterImportados(providerId: string, n: number) {
  for (let i = 0; i < n; i++) {
    await q(`INSERT INTO catalog_items (id, provider_id, name, origen, uid_externo, created_at)
      VALUES ($1, $2, $3, 'dardoventas', $4, now())`, [uuidv4(), providerId, `Importado ${i}`, `u${i}`]);
  }
}

describe('regalarPro', () => {
  it('un perfil Gratis pasa a Profesional hasta la fecha del regalo', async () => {
    const p = await registrar('provider');
    const hasta = dentroDe(90);
    await tx((c) => regalarPro(c, p.providerId!, hasta));
    const r = await plan(p.providerId!);
    expect(r?.subscription_plan).toBe('pro');
    expect(new Date(r!.subscription_expires_at!).getTime()).toBe(hasta.getTime());
  });

  it('un Profesional sin caducidad se queda sin caducidad', async () => {
    const p = await registrar('provider');
    await ponerPlan(p.providerId!, 'pro', null);
    await tx((c) => regalarPro(c, p.providerId!, dentroDe(90)));
    expect((await plan(p.providerId!))?.subscription_expires_at).toBeNull();
  });

  it('un plan pagado que vence DESPUÉS del regalo conserva su fecha', async () => {
    const p = await registrar('provider');
    const suya = dentroDe(200);
    await ponerPlan(p.providerId!, 'basic', suya.toISOString());
    await tx((c) => regalarPro(c, p.providerId!, dentroDe(90)));
    const r = await plan(p.providerId!);
    expect(r?.subscription_plan).toBe('pro');
    expect(new Date(r!.subscription_expires_at!).getTime()).toBe(suya.getTime());
  });

  it('un plan pagado que vence ANTES del regalo se alarga hasta el regalo', async () => {
    const p = await registrar('provider');
    await ponerPlan(p.providerId!, 'pro', dentroDe(10).toISOString());
    const hasta = dentroDe(90);
    await tx((c) => regalarPro(c, p.providerId!, hasta));
    expect(new Date((await plan(p.providerId!))!.subscription_expires_at!).getTime()).toBe(hasta.getTime());
  });

  it('al vencer el regalo, el job de siempre lo baja a Gratis y oculta el catálogo importado', async () => {
    const p = await registrar('provider');
    await tx((c) => regalarPro(c, p.providerId!, dentroDe(90)));
    await meterImportados(p.providerId!, 3);
    await q("UPDATE provider_profiles SET subscription_expires_at = now() - interval '1 minute' WHERE id = $1", [p.providerId]);
    await expireSubscriptions();
    expect((await plan(p.providerId!))?.subscription_plan).toBe('free');
    const visibles = await qOne<{ n: string }>(
      'SELECT count(*) AS n FROM catalog_items WHERE provider_id = $1 AND hidden_by_plan = false', [p.providerId],
    );
    expect(Number(visibles!.n)).toBe(0);
  });
});

describe('desvincular', () => {
  async function vinculado() {
    const p = await registrar('provider');
    await ponerPlan(p.providerId!, 'pro');
    await q(`UPDATE provider_profiles SET dardoventas_slug = $1, dardoventas_etag = '"e"', show_on_map = true WHERE id = $2`,
      [`slug-${uuidv4().replace(/-/g, '')}`, p.providerId]);
    await meterImportados(p.providerId!, 2);
    await q("INSERT INTO catalog_items (id, provider_id, name, created_at) VALUES ($1, $2, 'Propio', now())", [uuidv4(), p.providerId]);
    return p;
  }
  const estado = (id: string) => qOne<{ dardoventas_slug: string | null; dardoventas_etag: string | null; show_on_map: boolean }>(
    'SELECT dardoventas_slug, dardoventas_etag, show_on_map FROM provider_profiles WHERE id = $1', [id],
  );

  it('borra solo los importados, limpia el vínculo y respeta show_on_map si lo pide el comerciante', async () => {
    const p = await vinculado();
    await tx((c) => desvincular(c, p.providerId!, false));
    const nombres = (await q<{ name: string }>('SELECT name FROM catalog_items WHERE provider_id = $1', [p.providerId])).map((r) => r.name);
    expect(nombres).toEqual(['Propio']);
    expect(await estado(p.providerId!)).toEqual({ dardoventas_slug: null, dardoventas_etag: null, show_on_map: true });
  });

  it('con ocultarDelMapa (410 desde DardoVentas) el negocio sale del mapa', async () => {
    const p = await vinculado();
    await tx((c) => desvincular(c, p.providerId!, true));
    expect((await estado(p.providerId!))?.show_on_map).toBe(false);
  });
});
