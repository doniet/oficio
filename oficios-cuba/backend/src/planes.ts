// Planes y sus límites. Separados de config.ts porque ese módulo exige JWT_SECRET al cargarse y
// oficio_notifier (que no lo tiene) necesita aplicar los límites al importar un catálogo.
// maxServices = oficios publicados; maxServicePhotos = fotos de cada oficio;
// maxPhotos = fotos del negocio (galería del perfil); maxCatalog = artículos del catálogo
// (y fotos de catálogo que se pueden subir en 24 h); maxPriceRows = renglones de la lista
// de precios de cada oficio. null = sin límite. `premium` ya no se vende: las bases viejas
// lo migran a `pro`.
export const PLANS = {
  free: {
    name: 'Gratis', price: 0, maxServices: 1, maxServicePhotos: 1, maxPhotos: 0, maxCatalog: 0, maxPriceRows: 0, chat: false, agenda: false, negocio: false, pos: false,
    features: ['Nombre, logo y descripción de tu oficio', 'Una foto de tu trabajo', 'Dirección y ubicación en el mapa', 'Contacto por WhatsApp o llamada'],
  },
  basic: {
    name: 'Básico', price: Number(process.env.PLAN_BASICO_USD) || 1, maxServices: 5, maxServicePhotos: 5, maxPhotos: 10, maxCatalog: 50, maxPriceRows: 30, chat: false, agenda: false, negocio: false, pos: false,
    features: ['Todo lo del plan Gratis', 'Hasta 5 fotos en cada oficio', 'Lista de precios renglón a renglón en cada oficio', 'Hasta 5 oficios diferentes', 'Hasta 10 fotos de tu negocio', 'Catálogo de hasta 50 productos o servicios', 'Apareces antes que los gratuitos'],
  },
  pro: {
    name: 'Profesional', price: Number(process.env.PLAN_PROFESIONAL_USD) || 10, maxServices: null, maxServicePhotos: 6, maxPhotos: 30, maxCatalog: 1000, maxPriceRows: 100, chat: true, agenda: true, negocio: true, pos: true,
    features: ['Todo lo del plan Básico', 'Registra tu negocio, no solo tu oficio', 'Agenda de citas con tus clientes', 'Chat interno con los clientes', 'Punto de venta con DardoVentas', 'Catálogo de hasta 1000 productos o servicios', 'Oficios ilimitados y hasta 30 fotos del negocio'],
  },
} as const;

export type PlanId = keyof typeof PLANS;

export function planDe(plan: string | null | undefined) {
  return PLANS[(plan === 'premium' ? 'pro' : plan) as PlanId] ?? PLANS.free;
}
