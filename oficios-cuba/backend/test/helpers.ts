import request from 'supertest';
import app from '../src/app.js';
import { q, qOne } from '../src/db/acceso.js';

export const api = request(app);

let seq = 0;

export async function registrar(user_type: 'client' | 'provider', extra: Record<string, unknown> = {}) {
  seq += 1;
  const email = `${user_type}${seq}-${Date.now()}@test.cu`;
  const res = await api.post('/api/auth/register').send({
    email, password: 'Clave-segura-1', full_name: `Usuario ${seq}`,
    phone: '+53 5 123 4567', user_type, ...extra,
  });
  if (res.status !== 201) throw new Error(`registro falló: ${res.status} ${JSON.stringify(res.body)}`);
  const auth = { Authorization: `Bearer ${res.body.token}` };
  const providerId = user_type === 'provider'
    ? (await qOne<{ id: string }>('SELECT id FROM provider_profiles WHERE user_id = $1', [res.body.user.id]))!.id
    : undefined;
  return { email, token: res.body.token as string, auth, userId: res.body.user.id as string, providerId };
}

export async function categoriaId() {
  return (await qOne<{ id: string }>('SELECT id FROM categories WHERE parent_id IS NOT NULL LIMIT 1'))!.id;
}

export async function crearServicio(auth: Record<string, string>, extra: Record<string, unknown> = {}) {
  return api.post('/api/services').set(auth).send({
    category_id: await categoriaId(), title: 'Servicio de prueba', price_type: 'negotiable', ...extra,
  });
}

export async function ponerPlan(providerId: string, plan: 'free' | 'basic' | 'pro', expira: string | null = null) {
  await q(
    'UPDATE provider_profiles SET subscription_plan = $1, subscription_expires_at = $2 WHERE id = $3',
    [plan, expira, providerId],
  );
}

export async function activos(providerId: string) {
  const r = await qOne<{ n: string }>(
    'SELECT count(*) AS n FROM services WHERE provider_id = $1 AND is_active = true',
    [providerId],
  );
  return Number(r!.n);
}
