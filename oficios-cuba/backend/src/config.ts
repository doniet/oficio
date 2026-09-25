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

// maxServices = oficios publicados; maxPhotos = fotos del negocio (galería del perfil).
// null = sin límite. `premium` ya no se vende: las bases viejas lo migran a `pro`.
export const PLANS = {
  free: {
    name: 'Gratis', price: 0, maxServices: 1, maxPhotos: 0, chat: false, agenda: false, negocio: false, pos: false,
    features: ['Nombre, logo y descripción de tu oficio', 'Dirección y ubicación en el mapa', 'Contacto por WhatsApp o llamada'],
  },
  basic: {
    name: 'Básico', price: Number(process.env.PLAN_BASICO_USD) || 1, maxServices: 5, maxPhotos: 10, chat: false, agenda: false, negocio: false, pos: false,
    features: ['Todo lo del plan Gratis', 'Hasta 10 fotos de tu negocio', 'Hasta 5 oficios diferentes', 'Apareces antes que los gratuitos'],
  },
  pro: {
    name: 'Profesional', price: Number(process.env.PLAN_PROFESIONAL_USD) || 10, maxServices: null, maxPhotos: 30, chat: true, agenda: true, negocio: true, pos: true,
    features: ['Todo lo del plan Básico', 'Registra tu negocio, no solo tu oficio', 'Agenda de citas con tus clientes', 'Chat interno con los clientes', 'Punto de venta con DardoVentas', 'Oficios ilimitados y hasta 30 fotos'],
  },
} as const;

export type PlanId = keyof typeof PLANS;

export function planDe(plan: string | null | undefined) {
  return PLANS[(plan === 'premium' ? 'pro' : plan) as PlanId] ?? PLANS.free;
}

// Tasa de respaldo (CUP por 1 USD) si no se puede leer dardoventas.com/tasas.json.
export const TASA_CUP_USD = Number(process.env.TASA_CUP_USD) || 730;

// Login con Google real: solo si hay Client ID. En demo, sin él, se simula.
export const googleClientId = () => process.env.GOOGLE_CLIENT_ID || '';
