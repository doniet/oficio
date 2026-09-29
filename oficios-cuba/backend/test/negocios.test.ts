import { describe, expect, it } from 'vitest';
import { qOne } from '../src/db/acceso.js';
import { api, ponerPlan, registrar } from './helpers.js';

async function provinciaId() {
  return (await qOne<{ id: string }>('SELECT id FROM provinces LIMIT 1'))!.id;
}

/** Un perfil de plan Profesional marcado como negocio. */
async function crearNegocio(nombre: string) {
  const pro = await registrar('provider');
  await ponerPlan(pro.providerId!, 'pro');
  const res = await api.put('/api/providers/me/profile').set(pro.auth).send({
    business_name: nombre, province_id: await provinciaId(), kind: 'negocio', contact_mode: 'whatsapp',
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
    await ponerPlan(negocio.providerId!, 'basic');

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

describe('validación de imágenes', () => {
  // imagenPermitida es async desde la Tarea 8; sin `await` en el llamador la validación se salta
  // en silencio (!Promise es siempre false, o un .some() con callback async siempre da true), y el
  // typecheck no lo detecta (strict:false).
  it('la galería del negocio rechaza una URL externa arbitraria', async () => {
    const p = await registrar('provider');
    await ponerPlan(p.providerId!, 'basic'); // Gratis no tiene fotos de galería (maxPhotos=0).
    const res = await api.put('/api/providers/me/profile').set(p.auth).send({
      province_id: await provinciaId(), gallery: ['https://ejemplo.com/foto.jpg'],
    });
    expect(res.status).toBe(400);
  });
});

describe('orden de ?sort=rating', () => {
  // SQLite pone los NULL primero en ASC; Postgres los pone últimos. pp.rating no admite NULL hoy
  // (DEFAULT 0), pero el ORDER BY lleva NULLS LAST explícito para que esto no dependa de que nadie
  // recuerde la diferencia si la columna vuelve a admitir NULL.
  it('los perfiles sin reseñas salen después de los valorados', async () => {
    const { body } = await api.get('/api/providers?sort=rating');
    const valorados = body.providers.filter((p: { rating: number }) => p.rating > 0).length;
    const primeros = body.providers.slice(0, valorados);
    expect(primeros.every((p: { rating: number }) => p.rating > 0)).toBe(true);
  });
});
