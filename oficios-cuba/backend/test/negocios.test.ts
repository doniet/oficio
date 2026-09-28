import { describe, expect, it } from 'vitest';
import { api, db, ponerPlan, registrar } from './helpers.js';

function provinciaId() {
  return (db.prepare('SELECT id FROM provinces LIMIT 1').get() as { id: string }).id;
}

/** Un perfil de plan Profesional marcado como negocio. */
async function crearNegocio(nombre: string) {
  const pro = await registrar('provider');
  ponerPlan(pro.providerId!, 'pro');
  const res = await api.put('/api/providers/me/profile').set(pro.auth).send({
    business_name: nombre, province_id: provinciaId(), kind: 'negocio', contact_mode: 'whatsapp',
  });
  expect(res.status).toBe(200);
  return pro;
}

const ids = (body: { providers: { id: string }[] }) => body.providers.map((p) => p.id);

describe('filtrar el listado de proveedores por tipo', () => {
  it('kind=negocio devuelve los negocios y deja fuera los oficios', async () => {
    const negocio = await crearNegocio('Panadería del Sol');
    const oficio = await registrar('provider');

    const res = await api.get('/api/providers?kind=negocio&limit=48');
    expect(res.status).toBe(200);
    expect(ids(res.body)).toContain(negocio.providerId);
    expect(ids(res.body)).not.toContain(oficio.providerId);
  });

  it('kind=oficio deja fuera a los negocios', async () => {
    const negocio = await crearNegocio('Cafetería La Esquina');
    const oficio = await registrar('provider');

    const res = await api.get('/api/providers?kind=oficio&limit=48');
    expect(res.status).toBe(200);
    expect(ids(res.body)).toContain(oficio.providerId);
    expect(ids(res.body)).not.toContain(negocio.providerId);
  });

  // Review Focus 2: al bajar de plan, segunPlan() ya lo muestra como oficio.
  // Si el SQL no exigiera el plan, saldría en la pestaña Negocios contradiciendo su propia tarjeta.
  it('un negocio que baja al plan Básico deja de salir como negocio y pasa a oficio', async () => {
    const negocio = await crearNegocio('Barbería Central');
    ponerPlan(negocio.providerId!, 'basic');

    const comoNegocio = await api.get('/api/providers?kind=negocio&limit=48');
    expect(ids(comoNegocio.body)).not.toContain(negocio.providerId);

    const comoOficio = await api.get('/api/providers?kind=oficio&limit=48');
    expect(ids(comoOficio.body)).toContain(negocio.providerId);
  });

  it('sin kind salen los dos', async () => {
    const negocio = await crearNegocio('Ferretería del Puerto');
    const oficio = await registrar('provider');

    const res = await api.get('/api/providers?limit=48');
    expect(ids(res.body)).toEqual(expect.arrayContaining([negocio.providerId!, oficio.providerId!]));
  });

  // Review Focus 3: un valor inventado no puede colarse en el SQL ni devolver el listado entero.
  it('rechaza un kind que no existe', async () => {
    const res = await api.get('/api/providers?kind=cualquiera');
    expect(res.status).toBe(400);
    expect(res.body.providers).toBeUndefined();
  });
});
