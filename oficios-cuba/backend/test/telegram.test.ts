import { createServer } from 'http';
import { AddressInfo } from 'net';
import { describe, expect, it } from 'vitest';
import { api, db, ponerPlan, registrar } from './helpers.js';
import { programarAvisos } from '../src/lib/avisos.js';
import { atenderMensaje, clienteTelegram, enviarPendientes, TelegramError, type Llamar } from '../src/notifier/bot.js';

const botVivo = () => {
  const poner = db.prepare('INSERT INTO telegram_state (key, value) VALUES (?, ?) ON CONFLICT(key) DO UPDATE SET value = excluded.value');
  poner.run('bot_username', 'OficiosCubaBot');
  poner.run('heartbeat', new Date().toISOString());
};

let chat = 1000;
async function conectar(auth: Record<string, string>) {
  const link = await api.post('/api/telegram/link').set(auth);
  expect(link.status).toBe(200);
  const codigo = new URL(link.body.url).searchParams.get('start')!;
  const id = ++chat;
  const respuesta = atenderMensaje({ chat: { id, type: 'private' }, text: `/start ${codigo}` });
  return { codigo, chat: String(id), respuesta };
}

const avisosDe = (userId: string) => db.prepare("SELECT kind, text, url, dedupe_key FROM notifications WHERE user_id = ? ORDER BY created_at, rowid").all(userId) as
  { kind: string; text: string; url: string | null; dedupe_key: string | null }[];

async function profesionalConAgenda() {
  const p = await registrar('provider');
  ponerPlan(p.providerId!, 'pro');
  await api.put('/api/appointments/config').set(p.auth).send({
    semana: Array.from({ length: 7 }, () => [{ desde: '00:00', hasta: '24:00' }]), duracion: 60, intervalo: 60, antelacion_min: 0, horizonte_dias: 5, cancelacion_horas: 0,
  });
  return p;
}

describe('vinculación con Telegram', () => {
  it('sin el notificador en marcha no se puede conectar', async () => {
    db.prepare('DELETE FROM telegram_state').run();
    const c = await registrar('client');
    expect((await api.get('/api/telegram/status').set(c.auth)).body).toMatchObject({ available: false, linked: false });
    expect((await api.post('/api/telegram/link').set(c.auth)).status).toBe(503);
  });

  it('el código es de un solo uso, caduca y /stop desvincula', async () => {
    botVivo();
    const c = await registrar('client');
    const { codigo, chat: id, respuesta } = await conectar(c.auth);
    expect(respuesta).toContain('Listo');
    const estado = (await api.get('/api/telegram/status').set(c.auth)).body;
    expect(estado).toMatchObject({ available: true, bot_username: 'OficiosCubaBot', linked: true });
    expect(estado.groups.map((g: { id: string }) => g.id)).toEqual(['citas', 'recordatorios', 'chat']);
    // El código no se guarda en claro.
    expect(db.prepare('SELECT COUNT(*) AS n FROM telegram_link_tokens WHERE token_hash = ?').get(codigo)).toEqual({ n: 0 });

    expect(atenderMensaje({ chat: { id: 9, type: 'private' }, text: `/start ${codigo}` })).toContain('caducó');
    expect(atenderMensaje({ chat: { id: 9, type: 'group' }, text: '/start x' })).toBeNull();

    const otro = await registrar('client');
    const link = await api.post('/api/telegram/link').set(otro.auth);
    db.prepare("UPDATE telegram_link_tokens SET expires_at = '2000-01-01T00:00:00.000Z'").run();
    expect(atenderMensaje({ chat: { id: 10, type: 'private' }, text: `/start ${new URL(link.body.url).searchParams.get('start')}` })).toContain('caducó');

    expect(atenderMensaje({ chat: { id: Number(id), type: 'private' }, text: '/stop' })).toContain('ya no te enviaré');
    expect((await api.get('/api/telegram/status').set(c.auth)).body.linked).toBe(false);
  });

  it('un profesional ve también reseñas y plan, y puede apagar grupos', async () => {
    botVivo();
    const p = await registrar('provider');
    const estado = (await api.get('/api/telegram/status').set(p.auth)).body;
    expect(estado.groups.map((g: { id: string }) => g.id)).toEqual(['citas', 'recordatorios', 'chat', 'resenas', 'plan']);
    const cambiado = await api.put('/api/telegram/prefs').set(p.auth).send({ chat: false });
    expect(cambiado.body.prefs).toMatchObject({ citas: true, chat: false });
    expect((await api.put('/api/telegram/prefs').set(p.auth).send({ nada: true })).status).toBe(400);
  });
});

describe('avisos que apunta la API', () => {
  it('citas: nueva al profesional, confirmada y cancelada al cliente, y se respetan las preferencias', async () => {
    botVivo();
    const p = await profesionalConAgenda();
    const c = await registrar('client');
    await conectar(p.auth);
    await conectar(c.auth);
    const hora = (await api.get(`/api/appointments/provider/${p.providerId}/slots`)).body.days[1].slots[0];
    const cita = (await api.post('/api/appointments').set(c.auth).send({ provider_id: p.providerId, starts_at: hora })).body.appointment;

    expect(avisosDe(p.userId)[0]).toMatchObject({ kind: 'citas', url: 'https://oficio.dardoit.com/dashboard/agenda' });
    expect(avisosDe(p.userId)[0].text).toMatch(/^📅 Cita nueva por confirmar: Usuario \d+/);

    await api.patch(`/api/appointments/${cita.id}`).set(p.auth).send({ status: 'confirmed' });
    expect(avisosDe(c.userId).map((a) => a.text)[0]).toMatch(/^✅ .* confirmó tu cita/);

    await api.put('/api/telegram/prefs').set(c.auth).send({ citas: false });
    await api.patch(`/api/appointments/${cita.id}`).set(p.auth).send({ status: 'cancelled' });
    expect(avisosDe(c.userId)).toHaveLength(1);
  });

  it('chat: sin el texto del mensaje y un aviso por tramo de 10 minutos', async () => {
    botVivo();
    const p = await registrar('provider');
    ponerPlan(p.providerId!, 'pro');
    const c = await registrar('client');
    await conectar(p.auth);
    const conv = (await api.post('/api/conversations').set(c.auth).send({ provider_id: p.providerId, initial_message: 'Mi clave secreta es 1234' })).body.conversation;
    await api.post(`/api/conversations/${conv.id}/messages`).set(c.auth).send({ content: 'Otro mensaje' });
    const avisos = avisosDe(p.userId);
    expect(avisos).toHaveLength(1);
    expect(avisos[0].text).not.toContain('1234');
    expect(avisos[0].url).toContain(`/dashboard/mensajes/${conv.id}`);
  });

  it('recordatorio 24 h antes y aviso de vencimiento, una sola vez', async () => {
    botVivo();
    const p = await registrar('provider');
    const c = await registrar('client');
    await conectar(c.auth);
    await conectar(p.auth);
    const en = (h: number) => new Date(Date.now() + h * 3_600_000).toISOString();
    db.prepare(`INSERT INTO appointments (id, provider_id, client_id, starts_at, ends_at, duration_min, status, created_at)
      VALUES (?, ?, ?, ?, ?, 60, 'confirmed', ?)`).run(`rec-${c.userId}`, p.providerId, c.userId, en(22), en(23), en(-48));
    ponerPlan(p.providerId!, 'basic', en(48));
    programarAvisos();
    programarAvisos();
    expect(avisosDe(c.userId).filter((a) => a.kind === 'recordatorios')).toHaveLength(1);
    expect(avisosDe(c.userId)[0].text).toContain('Recordatorio');
    expect(avisosDe(p.userId).filter((a) => a.kind === 'plan')).toHaveLength(1);
  });
});

describe('oficio_notifier: envío', () => {
  async function conAviso() {
    botVivo();
    const c = await registrar('client');
    const { chat: id } = await conectar(c.auth);
    db.prepare("UPDATE notifications SET status = 'sent' WHERE status = 'pending'").run();
    await api.post('/api/telegram/test').set(c.auth);
    return { c, chat: id };
  }

  it('envía con botón a la web y marca como enviado', async () => {
    const { c, chat: id } = await conAviso();
    const llamadas: [string, Record<string, any>][] = [];
    const llamar: Llamar = async (m, d) => { llamadas.push([m, d]); return {}; };
    expect(await enviarPendientes(llamar)).toBe(1);
    expect(llamadas[0][1]).toMatchObject({ chat_id: id, text: expect.stringContaining('prueba') });
    expect(db.prepare('SELECT status FROM notifications WHERE user_id = ?').get(c.userId)).toEqual({ status: 'sent' });
    // Una segunda prueba en el mismo minuto no se apunta.
    expect((await api.post('/api/telegram/test').set(c.auth)).status).toBe(429);
  });

  it('si el usuario bloqueó el bot se desvincula; un 429 espera; lo viejo caduca', async () => {
    const { c } = await conAviso();
    await enviarPendientes(async () => { throw new TelegramError(429, 'Too Many Requests', 30); });
    const n = db.prepare('SELECT status, send_after FROM notifications WHERE user_id = ?').get(c.userId) as { status: string; send_after: string };
    expect(n.status).toBe('pending');
    expect(Date.parse(n.send_after)).toBeGreaterThan(Date.now() + 20_000);

    db.prepare('UPDATE notifications SET send_after = ? WHERE user_id = ?').run(new Date().toISOString(), c.userId);
    await enviarPendientes(async () => { throw new TelegramError(403, 'Forbidden: bot was blocked by the user'); });
    expect(db.prepare('SELECT telegram_chat_id FROM users WHERE id = ?').get(c.userId)).toEqual({ telegram_chat_id: null });

    const d = await conAviso();
    db.prepare("UPDATE notifications SET created_at = '2000-01-01T00:00:00.000Z' WHERE user_id = ?").run(d.c.userId);
    await enviarPendientes(async () => { throw new Error('no debería llamar'); });
    expect(db.prepare('SELECT status, last_error FROM notifications WHERE user_id = ?').get(d.c.userId)).toEqual({ status: 'skipped', last_error: 'caducado' });
  });

  it('el token del bot no aparece en los errores', async () => {
    const token = '123456:ABCDEFGHIJKLMNOPQRSTUVWXYZabcdefghij';
    const server = createServer((req, res) => {
      res.writeHead(401, { 'Content-Type': 'application/json' });
      res.end(JSON.stringify({ ok: false, description: `Unauthorized ${req.url}` }));
    });
    await new Promise<void>((r) => server.listen(0, '127.0.0.1', r));
    const base = `http://127.0.0.1:${(server.address() as AddressInfo).port}`;
    const err = await clienteTelegram(token, base)('getMe', {}).catch((e) => e);
    server.close();
    expect(err).toBeInstanceOf(TelegramError);
    expect(err.status).toBe(401);
    expect(err.message).not.toContain(token);
  });
});
