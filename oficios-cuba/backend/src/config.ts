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

export { PLANS, planDe, type PlanId } from './planes.js';

// Tasa de respaldo (CUP por 1 USD) si no se puede leer dardoventas.com/tasas.json.
export const TASA_CUP_USD = Number(process.env.TASA_CUP_USD) || 730;

// Login con Google real: solo si hay Client ID. En demo, sin él, se simula.
export const googleClientId = () => process.env.GOOGLE_CLIENT_ID || '';
