import { describe, expect, it } from 'vitest';
import { v4 as uuidv4 } from 'uuid';
import { q, qOne } from '../src/db/acceso.js';
import { borrarSiHuerfana } from '../src/routes/uploads.js';
import { api, ponerPlan, registrar } from './helpers.js';

const MENSAJE = 'Este artículo viene de DardoVentas: cámbialo en tu punto de venta.';

async function conImportado() {
  const p = await registrar('provider');
  await ponerPlan(p.providerId!, 'pro');
  const id = uuidv4();
  await q(`INSERT INTO catalog_items (id, provider_id, name, price, price_currency, origen, uid_externo, image, created_at)
    VALUES ($1, $2, 'Refresco', 250, 'CUP', 'dardoventas', 'u1', '/ext/dv/foto/abcdefghijklmnop/u1.jpg?v=1', now())`, [id, p.providerId]);
  return { ...p, id };
}

describe('artículos importados de DardoVentas', () => {
  it('no se editan, ni se borran, ni se marcan agotados a mano', async () => {
    const { auth, id } = await conImportado();
    const put = await api.put(`/api/catalog/${id}`).set(auth).send({ name: 'Otro', price: 1 });
    expect(put.status).toBe(403);
    expect(put.body.error).toBe(MENSAJE);
    expect((await api.delete(`/api/catalog/${id}`).set(auth)).status).toBe(403);
    expect((await api.patch(`/api/catalog/${id}/available`).set(auth).send({ available: false })).status).toBe(403);
    const fila = await qOne<{ name: string; available: boolean }>('SELECT name, available FROM catalog_items WHERE id = $1', [id]);
    expect(fila).toEqual({ name: 'Refresco', available: true });
  });

  it('salen con origen y convertible=false; los propios con convertible=true', async () => {
    const { auth, providerId } = await conImportado();
    await api.post('/api/catalog').set(auth).send({ name: 'Hecho en casa', price: 100 });
    const mios = (await api.get('/api/catalog/mine').set(auth)).body.items as { name: string; origen: string; convertible: boolean }[];
    expect(mios.find((i) => i.name === 'Refresco')).toMatchObject({ origen: 'dardoventas', convertible: false });
    expect(mios.find((i) => i.name === 'Hecho en casa')).toMatchObject({ origen: 'propio', convertible: true });
    const pub = (await api.get(`/api/catalog/provider/${providerId}`)).body.items as { name: string; convertible: boolean }[];
    expect(pub.find((i) => i.name === 'Refresco')?.convertible).toBe(false);
    const busca = (await api.get('/api/catalog/search').query({ q: 'Refresco' })).body.items as { name: string; convertible: boolean }[];
    expect(busca.find((i) => i.name === 'Refresco')?.convertible).toBe(false);
  });

  it('el proveedor no puede colar un artículo como importado por el POST', async () => {
    const p = await registrar('provider');
    await ponerPlan(p.providerId!, 'pro');
    const r = await api.post('/api/catalog').set(p.auth).send({ name: 'Trampa', price: 1, origen: 'dardoventas', uid_externo: 'u9' });
    expect(r.status).toBe(201);
    const fila = await qOne<{ origen: string; uid_externo: string | null }>('SELECT origen, uid_externo FROM catalog_items WHERE id = $1', [r.body.item.id]);
    expect(fila).toEqual({ origen: 'propio', uid_externo: null });
  });

  it('borrarSiHuerfana no toca nada con una ruta de foto externa', async () => {
    await expect(borrarSiHuerfana('/ext/dv/foto/abcdefghijklmnop/u1.jpg?v=1')).resolves.toBeUndefined();
  });
});
