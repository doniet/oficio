export const DEMO_MODE = process.env.DEMO_MODE === 'true';

const DEFAULT_SECRETS = new Set(['', 'your-secret-key', 'your-super-secret-jwt-key-change-in-production-min-32-chars']);

function resolveJwtSecret() {
  const secret = process.env.JWT_SECRET ?? '';
  if (!DEFAULT_SECRETS.has(secret) && secret.length >= 32) return secret;
  if (process.env.NODE_ENV === 'production') {
    throw new Error('JWT_SECRET ausente o inseguro (mínimo 32 caracteres). Defínelo en .env');
  }
  return 'dev-only-secret-not-for-production-use-000';
}

export const JWT_SECRET = resolveJwtSecret();

export const PLANS = {
  free: { name: 'Gratuito', price: 0, maxServices: 1, features: ['1 servicio publicado', 'Perfil básico', 'Chat con clientes'] },
  basic: { name: 'Básico', price: Number(process.env.PLAN_BASIC_PRICE) || 9.99, maxServices: 5, features: ['Hasta 5 servicios', 'Aparece antes que los gratuitos', 'Soporte por email'] },
  pro: { name: 'Profesional', price: Number(process.env.PLAN_PRO_PRICE) || 19.99, maxServices: null, features: ['Servicios ilimitados', 'Destacado en la portada', 'Insignia Pro', 'Soporte prioritario'] },
  premium: { name: 'Premium', price: Number(process.env.PLAN_PREMIUM_PRICE) || 39.99, maxServices: null, features: ['Todo lo de Pro', 'Primero en las búsquedas', 'Insignia Premium', 'Soporte 24/7'] },
} as const;

export type PlanId = keyof typeof PLANS;
