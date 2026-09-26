import request from 'supertest';
import app from '../src/app.js';
import db, { initDatabase } from '../src/db/index.js';
import { seedBase } from '../src/db/seed.js';

initDatabase();
seedBase();

export const api = request(app);
export { db };

let seq = 0;

export async function registrar(user_type: 'client' | 'provider', extra: Record<string, unknown> = {}) {
  seq += 1;
  const email = `${user_type}${seq}-${Date.now()}@test.cu`;
  const res = await api.post('/api/auth/register').send({
    email, password: 'Clave-segura-1', full_name: `Usuario ${seq}`, phone: '+53 5 123 4567', user_type, ...extra,
  });
  if (res.status !== 201) throw new Error(`registro falló: ${res.status} ${JSON.stringify(res.body)}`);
  const auth = { Authorization: `Bearer ${res.body.token}` };
  const providerId = user_type === 'provider'
    ? (db.prepare('SELECT id FROM provider_profiles WHERE user_id = ?').get(res.body.user.id) as { id: string }).id
    : undefined;
  return { email, token: res.body.token as string, auth, userId: res.body.user.id as string, providerId };
}

export function categoriaId() {
  return (db.prepare('SELECT id FROM categories WHERE parent_id IS NOT NULL LIMIT 1').get() as { id: string }).id;
}

export async function crearServicio(auth: Record<string, string>, extra: Record<string, unknown> = {}) {
  const res = await api.post('/api/services').set(auth).send({
    category_id: categoriaId(), title: 'Servicio de prueba', price_type: 'negotiable', ...extra,
  });
  return res;
}

export function ponerPlan(providerId: string, plan: 'free' | 'basic' | 'pro', expira: string | null = null) {
  db.prepare('UPDATE provider_profiles SET subscription_plan = ?, subscription_expires_at = ? WHERE id = ?').run(plan, expira, providerId);
}

export function activos(providerId: string) {
  return (db.prepare('SELECT COUNT(*) AS n FROM services WHERE provider_id = ? AND is_active = 1').get(providerId) as { n: number }).n;
}
