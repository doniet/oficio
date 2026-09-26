import { describe, expect, it } from 'vitest';
import { activos, api, crearServicio, db, ponerPlan, registrar } from './helpers.js';

const FOTO = '/demo/electricidad-1.webp';

async function perfilBase(auth: Record<string, string>, extra: Record<string, unknown> = {}) {
  const provincia = (db.prepare("SELECT id FROM provinces WHERE name = 'La Habana'").get() as { id: string }).id;
  return api.put('/api/providers/me/profile').set(auth).send({ business_name: 'Mi Taller', province_id: provincia, whatsapp: '+53 5 111 2222', ...extra });
}

describe('plan Gratis', () => {
  it('publica un solo oficio y sin fotos', async () => {
    const p = await registrar('provider');
    expect((await crearServicio(p.auth)).status).toBe(201);
    const segundo = await crearServicio(p.auth);
    expect(segundo.status).toBe(403);
    expect(segundo.body.error).toMatch(/1 oficio/);

    const conFoto = await crearServicio(p.auth, { images: [FOTO] });
    expect(conFoto.status).toBe(403);
  });

  it('elige cómo lo contactan y no puede subir galería ni registrar negocio', async () => {
    const p = await registrar('provider');
    const ok = await perfilBase(p.auth, { contact_mode: 'call', lat: 23.13, lng: -82.38, address: 'Calle 23', show_on_map: true });
    expect(ok.status).toBe(200);
    expect(ok.body.provider.contact_mode).toBe('call');

    expect((await perfilBase(p.auth, { gallery: [FOTO] })).status).toBe(403);
    expect((await perfilBase(p.auth, { kind: 'negocio' })).status).toBe(403);

    const publico = await api.get(`/api/providers/${p.providerId}`);
    expect(publico.body.provider).toMatchObject({ contact_mode: 'call', has_chat: false, has_agenda: false, lat: 23.13 });
  });

  it('al bajar a Gratis las fotos que tenía dejan de verse, pero no se borran', async () => {
    const p = await registrar('provider');
    ponerPlan(p.providerId!, 'basic');
    const s = (await crearServicio(p.auth, { images: [FOTO] })).body.service.id;
    ponerPlan(p.providerId!, 'free');
    expect((await api.get(`/api/services/${s}`)).body.service.images).toEqual([]);
    expect((await api.get(`/api/services/${s}`).set(p.auth)).body.service.images).toEqual([FOTO]);
  });
});

describe('plan Básico', () => {
  it('hasta 5 oficios y 10 fotos del negocio', async () => {
    const p = await registrar('provider');
    ponerPlan(p.providerId!, 'basic');
    for (let i = 0; i < 5; i++) expect((await crearServicio(p.auth)).status).toBe(201);
    expect((await crearServicio(p.auth)).status).toBe(403);
    expect(activos(p.providerId!)).toBe(5);

    expect((await perfilBase(p.auth, { gallery: Array(10).fill(FOTO) })).status).toBe(200);
    expect((await perfilBase(p.auth, { gallery: Array(11).fill(FOTO) })).status).toBe(403);
  });
});

describe('precios en CUP o USD', () => {
  it('guarda la moneda del precio (CUP por defecto)', async () => {
    const p = await registrar('provider');
    ponerPlan(p.providerId!, 'pro');
    const cup = (await crearServicio(p.auth, { price_type: 'fixed', price_min: 5000 })).body.service.id;
    const usd = (await crearServicio(p.auth, { price_type: 'fixed', price_min: 40, price_currency: 'USD' })).body.service.id;
    expect((await api.get(`/api/services/${cup}`)).body.service.price_currency).toBe('CUP');
    expect((await api.get(`/api/services/${usd}`)).body.service.price_currency).toBe('USD');
  });

  it('la API da una tasa de respaldo', async () => {
    const res = await api.get('/api/tasas');
    expect(res.body.usd).toBeGreaterThan(0);
  });
});

describe('chat solo en el plan Profesional', () => {
  it('no se abre chat con un Gratis/Básico y un Profesional sí', async () => {
    const p = await registrar('provider');
    const c = await registrar('client');
    const abrir = () => api.post('/api/conversations').set(c.auth).send({ provider_id: p.providerId, initial_message: 'Hola' });
    expect((await abrir()).status).toBe(403);
    ponerPlan(p.providerId!, 'pro');
    const conv = await abrir();
    expect(conv.status).toBe(201);

    // Si deja el plan, la conversación se lee pero no se puede seguir escribiendo.
    ponerPlan(p.providerId!, 'basic');
    const id = conv.body.conversation.id;
    expect((await api.get(`/api/conversations/${id}`).set(c.auth)).status).toBe(200);
    expect((await api.post(`/api/conversations/${id}/messages`).set(p.auth).send({ content: 'Hola' })).status).toBe(403);
  });
});

describe('reseñas sin chat', () => {
  it('un cliente que contactó por WhatsApp con su sesión puede reseñar', async () => {
    const p = await registrar('provider');
    const c = await registrar('client');
    const s = (await crearServicio(p.auth)).body.service.id;
    expect((await api.get(`/api/reviews/eligibility/${s}`).set(c.auth)).body.can_review).toBe(false);

    expect((await api.post(`/api/providers/${p.providerId}/contact`).set(c.auth).send({ via: 'whatsapp' })).status).toBe(204);
    expect((await api.get(`/api/reviews/eligibility/${s}`).set(c.auth)).body.can_review).toBe(true);
  });

  it('un visitante anónimo no deja constancia de contacto', async () => {
    const p = await registrar('provider');
    expect((await api.post(`/api/providers/${p.providerId}/contact`).send({ via: 'call' })).status).toBe(204);
    expect(db.prepare('SELECT COUNT(*) AS n FROM contacts WHERE provider_id = ?').get(p.providerId)).toEqual({ n: 0 });
  });
});

describe('negocio (plan Profesional)', () => {
  it('registra un negocio con horario; al perder el plan vuelve a verse como oficio', async () => {
    const p = await registrar('provider');
    ponerPlan(p.providerId!, 'pro');
    const res = await perfilBase(p.auth, { kind: 'negocio', horario: 'Lunes a viernes 9-5' });
    expect(res.status).toBe(200);
    expect((await api.get(`/api/providers/${p.providerId}`)).body.provider).toMatchObject({ kind: 'negocio', horario: 'Lunes a viernes 9-5' });
    ponerPlan(p.providerId!, 'free');
    expect((await api.get(`/api/providers/${p.providerId}`)).body.provider).toMatchObject({ kind: 'oficio', horario: null });
  });
});

describe('agenda de citas', () => {
  it('solo los Profesional tienen agenda', async () => {
    const p = await registrar('provider');
    expect((await api.get(`/api/appointments/provider/${p.providerId}/slots`)).status).toBe(404);
  });

  it('el cliente pide un hueco libre, no se puede reservar dos veces y el profesional confirma', async () => {
    const p = await registrar('provider');
    const c = await registrar('client');
    const otro = await registrar('client');
    ponerPlan(p.providerId!, 'pro');
    await api.put('/api/appointments/config').set(p.auth).send({ dias: [0, 1, 2, 3, 4, 5, 6], desde: '08:00', hasta: '18:00', duracion: 60 });

    const huecos = (await api.get(`/api/appointments/provider/${p.providerId}/slots`)).body.days;
    expect(huecos.length).toBeGreaterThan(0);
    const hora = huecos[1].slots[0];

    const pedir = (auth: Record<string, string>, starts_at = hora) => api.post('/api/appointments').set(auth).send({ provider_id: p.providerId, starts_at, note: 'Revisión' });
    const cita = await pedir(c.auth);
    expect(cita.status).toBe(201);
    expect(cita.body.appointment.status).toBe('pending');
    expect((await pedir(otro.auth)).status).toBe(409);

    const libres = (await api.get(`/api/appointments/provider/${p.providerId}/slots`)).body.days.flatMap((d: { slots: string[] }) => d.slots);
    expect(libres).not.toContain(hora);

    // Una hora fuera de la agenda no vale.
    expect((await pedir(otro.auth, new Date(Date.parse(hora) + 30 * 60_000).toISOString())).status).toBe(409);

    const id = cita.body.appointment.id;
    expect((await api.patch(`/api/appointments/${id}`).set(c.auth).send({ status: 'confirmed' })).status).toBe(403);
    expect((await api.patch(`/api/appointments/${id}`).set(p.auth).send({ status: 'confirmed' })).body.appointment.status).toBe('confirmed');

    const delProfesional = (await api.get('/api/appointments/mine').set(p.auth)).body.appointments;
    expect(delProfesional[0]).toMatchObject({ id, client_phone: '+53 5 123 4567' });
    const delCliente = (await api.get('/api/appointments/mine').set(c.auth)).body.appointments;
    expect(delCliente[0].client_phone).toBeUndefined();

    // Otro profesional no ve ni toca la cita.
    const ajeno = await registrar('provider');
    expect((await api.patch(`/api/appointments/${id}`).set(ajeno.auth).send({ status: 'cancelled' })).status).toBe(404);

    expect((await api.patch(`/api/appointments/${id}`).set(c.auth).send({ status: 'cancelled' })).body.appointment.status).toBe('cancelled');
  });

  it('un Gratis no puede configurar agenda', async () => {
    const p = await registrar('provider');
    expect((await api.put('/api/appointments/config').set(p.auth).send({ dias: [1], desde: '09:00', hasta: '12:00', duracion: 60 })).status).toBe(403);
  });
});

describe('filtro de precio en CUP', () => {
  it('convierte los precios en USD antes de comparar', async () => {
    const p = await registrar('provider');
    ponerPlan(p.providerId!, 'pro');
    await crearServicio(p.auth, { price_type: 'fixed', price_min: 50, price_currency: 'USD' });
    await crearServicio(p.auth, { price_type: 'fixed', price_min: 5000 });
    const res = await api.get('/api/services').query({ provider_id: p.providerId, price_max: 10000 });
    expect(res.body.services.map((s: { price_currency: string }) => s.price_currency)).toEqual(['CUP']);
  });
});
