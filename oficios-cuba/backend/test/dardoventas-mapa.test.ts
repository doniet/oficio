import { describe, expect, it } from 'vitest';
import { qOne } from '../src/db/acceso.js';
import { canjearPendientes, type ConfigDv } from '../src/notifier/dardoventas.js';
import { api, registrar } from './helpers.js';
import { art, BASE, pedirFalso, respuestaCatalogo } from './dardoventas-doble.js';

// Criterio de aceptación 1 del spec: un comerciante que vincula DardoVentas y marca su negocio en
// el mapa sale en las pestañas Negocios y Productos, por el camino real (canje + PUT del perfil).
const cfg: ConfigDv = { base: BASE, secreto: 'secreto-de-prueba', proHasta: new Date(Date.now() + 90 * 86_400_000) };
const HABANA = { lat: 23.13, lng: -82.38 };
const BBOX = '23.08,-82.43,23.18,-82.33';

describe('DardoVentas → mapa', () => {
  it('un negocio vinculado y puesto en el mapa sale en tab=negocios y en tab=productos', async () => {
    const p = await registrar('provider');
    expect((await api.post('/api/dardoventas/vincular').set(p.auth).send({ code: 'codigo-de-prueba-1234567890' })).status).toBe(202);
    const slug = `slug${Math.random().toString(36).slice(2).padEnd(14, '0')}`;
    const { pedir } = pedirFalso((url) => (url.endsWith('/api/pub/link')
      ? Response.json({ ok: true, slug, businessName: 'Cafetería La Esquina' })
      : respuestaCatalogo([art('a'), art('b')])));
    await canjearPendientes(cfg, pedir);

    const provincia = (await qOne<{ id: string }>('SELECT id FROM provinces LIMIT 1'))!.id;
    const put = await api.put('/api/providers/me/profile').set(p.auth).send({
      business_name: 'Cafetería La Esquina', province_id: provincia, contact_mode: 'whatsapp',
      kind: 'negocio', lat: HABANA.lat, lng: HABANA.lng, show_on_map: true, map_precision: 'exacta',
    });
    expect(put.status).toBe(200);

    for (const tab of ['negocios', 'productos']) {
      const r = await api.get(`/api/mapa?bbox=${BBOX}&tab=${tab}`);
      expect(r.status).toBe(200);
      const punto = r.body.puntos.find((x: { id: string }) => x.id === p.providerId);
      expect(punto, `tab=${tab}`).toMatchObject({ tipo: 'negocio', nombre: 'Cafetería La Esquina', plan: 'pro' });
    }
    const productos = await api.get(`/api/mapa?bbox=${BBOX}&tab=productos`);
    expect(productos.body.puntos.find((x: { id: string }) => x.id === p.providerId).resumen).toBe('2 artículos');
  });
});
