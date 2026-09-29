import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { parseImages, parsePriceList, PLAN_WEIGHT_SQL, providerProfileIdFor, refreshProviderRating } from '../db/index.js';
import { q, qOne, tx } from '../db/acceso.js';
import { imagenPermitida, queryTextos } from '../lib/entrada.js';
import { authMiddleware, AuthRequest, optionalAuth, requireProvider } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { planDe, TASA_CUP_USD } from '../config.js';

const router = Router();

const imageUrl = z.string().max(500);

// Un renglón de la lista de precios: concepto y precio, en la moneda del oficio.
const priceRowSchema = z.object({
  name: z.string().trim().min(1, 'Cada renglón necesita un concepto').max(80),
  price: z.number().min(0).max(100_000_000),
});
type PriceRow = z.infer<typeof priceRowSchema>;

const optionalNumber = z.preprocess((v) => (v === '' || v === null ? undefined : v), z.number().min(0).max(1_000_000).optional());

const serviceSchema = z.object({
  category_id: z.string().uuid('Elige una categoría'),
  title: z.string().trim().min(5, 'El título debe tener al menos 5 caracteres').max(100),
  description: z.string().trim().max(3000).optional(),
  price_min: optionalNumber,
  price_max: optionalNumber,
  price_type: z.enum(['fixed', 'hourly', 'daily', 'negotiable']).default('negotiable'),
  price_currency: z.enum(['CUP', 'USD']).default('CUP'),
  images: z.array(imageUrl).max(30).optional(),
  price_list: z.array(priceRowSchema).max(200).optional(),
  duration_min: z.preprocess((v) => (v === '' ? null : v), z.number().int().min(10).max(480).nullable().optional()),
});

const LIST_COLUMNS = `
  s.id, s.title, s.description, s.price_min, s.price_max, s.price_type, s.price_currency, s.images, s.duration_min, s.is_active, s.created_at,
  s.category_id, c.name AS category_name, c.icon AS category_icon, c.slug AS category_slug,
  parent.name AS parent_category_name, parent.slug AS parent_category_slug,
  pp.id AS provider_id, pp.business_name, pp.rating, pp.review_count, pp.subscription_plan, pp.kind, pp.contact_mode,
  u.full_name AS owner_name, u.avatar_url,
  p.name AS province_name, m.name AS municipality_name
`;

const LIST_JOINS = `
  FROM services s
  JOIN categories c ON s.category_id = c.id
  LEFT JOIN categories parent ON c.parent_id = parent.id
  JOIN provider_profiles pp ON s.provider_id = pp.id
  JOIN users u ON pp.user_id = u.id
  LEFT JOIN provinces p ON pp.province_id = p.id
  LEFT JOIN municipalities m ON pp.municipality_id = m.id
`;

// Los listados solo necesitan la portada; las fotos completas van en el detalle.
// Al bajar de plan las fotos de más no se borran: dejan de mostrarse.
function fotosVisibles(row: { images: unknown; subscription_plan: string }) {
  return parseImages(row.images).slice(0, planDe(row.subscription_plan).maxServicePhotos);
}

// La lista de precios es de los planes de pago; con el Gratis la que tenía deja de verse.
function preciosVisibles(row: { price_list: unknown; subscription_plan: string }) {
  return parsePriceList(row.price_list).slice(0, planDe(row.subscription_plan).maxPriceRows);
}

function toListItem(row: any) {
  const images = fotosVisibles(row);
  const { images: _omit, ...rest } = row;
  const plan = planDe(row.subscription_plan);
  return {
    ...rest, subscription_plan: row.subscription_plan === 'premium' ? 'pro' : row.subscription_plan,
    kind: plan.negocio ? row.kind : 'oficio', has_chat: plan.chat, has_agenda: plan.agenda,
    cover: images[0] ?? null, image_count: images.length, is_active: Boolean(row.is_active),
  };
}

const PRECIO_CUP = (col: string) => `(CASE WHEN s.price_currency = 'USD' THEN ${col} * ${Number(TASA_CUP_USD)} ELSE ${col} END)`;

router.get('/', asyncHandler(async (req, res) => {
  const { provider_id, category, category_id, province_id, municipality_id, q: texto, price_max, price_type, sort = 'relevance' } =
    queryTextos(req.query, ['provider_id', 'category', 'category_id', 'province_id', 'municipality_id', 'q', 'price_max', 'price_type', 'sort'] as const);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(48, Math.max(1, Number(req.query.limit) || 12));

  let where = 'WHERE s.is_active = true AND pp.is_active = true';
  const params: unknown[] = [];

  if (provider_id) { params.push(provider_id); where += ` AND s.provider_id = $${params.length}`; }

  const categoryKey = category || category_id;
  if (categoryKey) {
    params.push(categoryKey, categoryKey, categoryKey, categoryKey);
    const n = params.length;
    where += ` AND s.category_id IN (
      SELECT id FROM categories WHERE id = $${n - 3} OR slug = $${n - 2}
      UNION SELECT id FROM categories WHERE parent_id IN (SELECT id FROM categories WHERE id = $${n - 1} OR slug = $${n}))`;
  }
  if (province_id) { params.push(province_id); where += ` AND pp.province_id = $${params.length}`; }
  if (municipality_id) {
    params.push(municipality_id, municipality_id);
    const n = params.length;
    where += ` AND (pp.municipality_id = $${n - 1} OR EXISTS (SELECT 1 FROM service_areas sa WHERE sa.provider_id = pp.id AND sa.municipality_id = $${n}))`;
  }
  if (price_max && Number(price_max) > 0) {
    params.push(Number(price_max));
    // El filtro va en CUP; los precios en USD se convierten con la tasa de respaldo (aproximado).
    where += ` AND (s.price_min IS NULL OR ${PRECIO_CUP('s.price_min')} <= $${params.length})`;
  }
  if (price_type) { params.push(price_type); where += ` AND s.price_type = $${params.length}`; }
  if (texto && texto.trim()) {
    const term = `%${texto.trim()}%`;
    params.push(term, term, term, term, term);
    const n = params.length;
    where += ` AND (s.title ILIKE $${n - 4} OR s.description ILIKE $${n - 3} OR c.name ILIKE $${n - 2} OR parent.name ILIKE $${n - 1} OR pp.business_name ILIKE $${n})`;
  }

  // NULLS LAST explícito: pp.rating no admite NULL hoy (DEFAULT 0), pero Postgres pone los NULL
  // últimos en DESC a diferencia de SQLite, así que se fija por si esa columna vuelve a admitirlos.
  const orders: Record<string, string> = {
    relevance: `${PLAN_WEIGHT_SQL} DESC, pp.rating DESC NULLS LAST, pp.review_count DESC, s.created_at DESC`,
    rating: 'pp.rating DESC NULLS LAST, pp.review_count DESC',
    price_asc: `CASE WHEN s.price_min IS NULL THEN 1 ELSE 0 END, ${PRECIO_CUP('s.price_min')} ASC`,
    price_desc: `${PRECIO_CUP('COALESCE(s.price_max, s.price_min, 0)')} DESC`,
    newest: 's.created_at DESC',
  };
  const orderBy = orders[sort] ?? orders.relevance;

  const total = Number((await qOne<{ count: string }>(`SELECT COUNT(*) AS count ${LIST_JOINS} ${where}`, params))!.count);
  const limitParams = [...params, limit, (page - 1) * limit];
  const rows = await q<any>(
    `SELECT ${LIST_COLUMNS} ${LIST_JOINS} ${where} ORDER BY ${orderBy} LIMIT $${limitParams.length - 1} OFFSET $${limitParams.length}`,
    limitParams,
  );

  res.json({
    services: rows.map(toListItem),
    pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) },
  });
}));

router.get('/mine', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const providerId = await providerProfileIdFor(req.user!.id);
  if (!providerId) throw new AppError('Perfil de proveedor no encontrado', 404);
  const rows = await q<any>(`SELECT ${LIST_COLUMNS} ${LIST_JOINS} WHERE s.provider_id = $1 ORDER BY s.is_active DESC, s.created_at DESC`, [providerId]);
  const plan = (await qOne<{ subscription_plan: string }>('SELECT subscription_plan FROM provider_profiles WHERE id = $1', [providerId]))!.subscription_plan;
  const limites = planDe(plan);
  // El dueño ve sus fotos aunque su plan ya no las muestre.
  const services = rows.map((r: any) => ({ ...toListItem({ ...r, subscription_plan: 'pro' }), subscription_plan: plan }));
  res.json({ services, plan, max_services: limites.maxServices, max_service_photos: limites.maxServicePhotos, max_price_rows: limites.maxPriceRows });
}));

router.get('/:id', optionalAuth, asyncHandler(async (req: AuthRequest, res) => {
  const service = await qOne<any>(`
    SELECT s.*, c.name AS category_name, c.icon AS category_icon, c.slug AS category_slug, c.parent_id AS category_parent_id,
      pp.id AS provider_id, pp.user_id AS provider_user_id, pp.business_name, pp.description AS provider_description,
      pp.province_id, pp.municipality_id, pp.address, pp.whatsapp, pp.telegram, pp.email_contact,
      pp.years_experience, pp.rating, pp.review_count, pp.subscription_plan, pp.is_active AS provider_active,
      pp.kind, pp.contact_mode, pp.horario,
      p.name AS province_name, m.name AS municipality_name,
      u.full_name AS owner_name, u.avatar_url
    FROM services s
    JOIN categories c ON s.category_id = c.id
    LEFT JOIN categories parent ON c.parent_id = parent.id
    JOIN provider_profiles pp ON s.provider_id = pp.id
    JOIN users u ON pp.user_id = u.id
    LEFT JOIN provinces p ON pp.province_id = p.id
    LEFT JOIN municipalities m ON pp.municipality_id = m.id
    WHERE s.id = $1
  `, [req.params.id]);

  const isOwner = service && req.user?.id === service.provider_user_id;
  if (!service || (!isOwner && (!service.is_active || !service.provider_active))) {
    throw new AppError('Servicio no encontrado', 404);
  }

  const reviews = await q<any>(`
    SELECT r.id, r.rating, r.comment, r.created_at, u.full_name AS client_name, u.avatar_url AS client_avatar
    FROM reviews r JOIN users u ON r.client_id = u.id
    WHERE r.service_id = $1 ORDER BY r.created_at DESC LIMIT 20
  `, [req.params.id]);

  const related = await q<any>(`
    SELECT ${LIST_COLUMNS} ${LIST_JOINS}
    WHERE s.is_active = true AND pp.is_active = true AND s.id != $1 AND pp.id != $2 AND (s.category_id = $3 OR c.parent_id = $4)
    ORDER BY ${PLAN_WEIGHT_SQL} DESC, pp.rating DESC NULLS LAST LIMIT 4
  `, [service.id, service.provider_id, service.category_id, service.category_parent_id ?? service.category_id]);

  const { provider_user_id: _u, provider_active: _a, category_parent_id: _c, ...publicService } = service;
  const plan = planDe(service.subscription_plan);
  res.json({
    service: {
      ...publicService, subscription_plan: service.subscription_plan === 'premium' ? 'pro' : service.subscription_plan,
      kind: plan.negocio ? service.kind : 'oficio', horario: plan.negocio ? service.horario : null,
      has_chat: plan.chat, has_agenda: plan.agenda,
      images: isOwner ? parseImages(service.images) : fotosVisibles(service),
      price_list: isOwner ? parsePriceList(service.price_list) : preciosVisibles(service),
      is_active: Boolean(service.is_active), is_owner: Boolean(isOwner),
    },
    reviews,
    related: related.map(toListItem),
  });
}));

// imagenPermitida es async (consulta uploads): no vale Array.prototype.some con un callback async
// (siempre da true porque una Promise es un objeto truthy), así que se recorre con un bucle.
async function assertImages(images: string[] | undefined, userId: string, subscriptionPlan: string, yaGuardadas: string[] = []) {
  const plan = planDe(subscriptionPlan);
  const nuevas = (images ?? []).filter((url) => !yaGuardadas.includes(url));
  // Las que ya estaban se conservan aunque el plan haya bajado; solo se limita lo que añade.
  if ((images ?? []).length > plan.maxServicePhotos && nuevas.length) {
    throw new AppError(`Tu plan ${plan.name} permite ${plan.maxServicePhotos} foto${plan.maxServicePhotos === 1 ? '' : 's'} en cada oficio. Mejora tu plan para subir más.`, 403);
  }
  for (const url of images ?? []) {
    if (!(await imagenPermitida(url, userId, yaGuardadas))) {
      throw new AppError('Alguna foto no es válida: súbela desde el formulario', 400);
    }
  }
}

function assertPriceList(priceList: PriceRow[] | undefined, subscriptionPlan: string, yaGuardados = 0) {
  if (!priceList?.length) return;
  const plan = planDe(subscriptionPlan);
  if (!plan.maxPriceRows) {
    throw new AppError(`El plan ${plan.name} no incluye lista de precios. Mejora tu plan para ponerla.`, 403);
  }
  // Igual que con las fotos: lo que ya estaba guardado se puede seguir guardando.
  if (priceList.length > plan.maxPriceRows && priceList.length > yaGuardados) {
    throw new AppError(`Tu plan ${plan.name} permite ${plan.maxPriceRows} renglones en la lista de precios.`, 403);
  }
}

function assertPriceRange(data: { price_min?: number; price_max?: number }) {
  if (data.price_min != null && data.price_max != null && data.price_max < data.price_min) {
    throw new AppError('El precio máximo no puede ser menor que el mínimo', 400);
  }
}

router.post('/', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const provider = await qOne<{ id: string; subscription_plan: string }>('SELECT id, subscription_plan FROM provider_profiles WHERE user_id = $1', [req.user!.id]);
  if (!provider) throw new AppError('Debes completar tu perfil de proveedor primero', 400);

  const data = serviceSchema.parse(req.body);
  assertPriceRange(data);
  await assertImages(data.images, req.user!.id, provider.subscription_plan);
  assertPriceList(data.price_list, provider.subscription_plan);
  if (!(await qOne('SELECT 1 FROM categories WHERE id = $1', [data.category_id]))) throw new AppError('Categoría no válida', 400);

  const id = uuidv4();
  // RETURNING created_at: el contrato de la API (Tarea 5, app.ts) exige que las fechas salgan como
  // cadena ISO también en la respuesta de creación, no solo al releer — el test heredado lo comprueba.
  let created_at!: string;
  // Contar los activos y crear van en la misma transacción, consultando solo con `c`: dos
  // peticiones a la vez no deben poder colarse las dos por encima del tope del plan.
  await tx(async (c) => {
    const { maxServices: max, name: planName } = planDe(provider.subscription_plan);
    if (max !== null) {
      const count = Number((await c.qOne<{ count: string }>('SELECT COUNT(*) AS count FROM services WHERE provider_id = $1', [provider.id]))!.count);
      if (count >= max) {
        throw new AppError(`Tu plan ${planName} permite ${max} oficio${max === 1 ? '' : 's'}. Mejora tu plan para publicar más.`, 403);
      }
    }

    const inserted = await c.qOne<{ created_at: string }>(`
      INSERT INTO services (id, provider_id, category_id, title, description, price_min, price_max, price_type, price_currency, images, price_list, duration_min, created_at)
      VALUES ($1, $2, $3, $4, $5, $6, $7, $8, $9, $10, $11, $12, $13)
      RETURNING created_at
    `, [id, provider.id, data.category_id, data.title, data.description || null,
      data.price_type === 'negotiable' ? null : data.price_min ?? null,
      data.price_type === 'negotiable' ? null : data.price_max ?? null,
      data.price_type, data.price_currency, JSON.stringify(data.images ?? []), JSON.stringify(data.price_list ?? []),
      data.duration_min ?? null, new Date().toISOString()]);
    created_at = inserted!.created_at;
  });

  res.status(201).json({ service: { id, created_at } });
}));

async function ownedService(req: AuthRequest) {
  const providerId = await providerProfileIdFor(req.user!.id);
  if (!providerId) throw new AppError('Perfil de proveedor no encontrado', 404);
  const service = await qOne<{ id: string; provider_id: string; is_active: boolean; images: unknown; price_list: unknown; subscription_plan: string }>(`
    SELECT s.id, s.provider_id, s.is_active, s.images, s.price_list, pp.subscription_plan FROM services s
    JOIN provider_profiles pp ON s.provider_id = pp.id WHERE s.id = $1 AND s.provider_id = $2
  `, [req.params.id, providerId]);
  if (!service) throw new AppError('Servicio no encontrado', 404);
  return service;
}

router.put('/:id', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const current = await ownedService(req);
  const data = serviceSchema.parse(req.body);
  assertPriceRange(data);
  await assertImages(data.images, req.user!.id, current.subscription_plan, parseImages(current.images));
  assertPriceList(data.price_list, current.subscription_plan, parsePriceList(current.price_list).length);
  if (!(await qOne('SELECT 1 FROM categories WHERE id = $1', [data.category_id]))) throw new AppError('Categoría no válida', 400);

  const negotiable = data.price_type === 'negotiable';
  await q(`
    UPDATE services SET category_id = $1, title = $2, description = $3, price_min = $4, price_max = $5, price_type = $6, price_currency = $7, images = $8, price_list = $9, duration_min = $10, updated_at = now()
    WHERE id = $11
  `, [data.category_id, data.title, data.description || null,
    negotiable ? null : data.price_min ?? null, negotiable ? null : data.price_max ?? null,
    data.price_type, data.price_currency, JSON.stringify(data.images ?? []), JSON.stringify(data.price_list ?? []),
    data.duration_min ?? null, req.params.id]);

  res.json({ service: { id: req.params.id } });
}));

router.delete('/:id', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const service = await ownedService(req);
  // Las reseñas del servicio se quedan (service_id pasa a NULL) y siguen contando para el proveedor.
  // refreshProviderRating usa el pool (db/index.ts, Tarea 5), no el cliente `c`: no puede ir dentro
  // de la transacción (violaría la regla de "nunca el pool dentro de tx()"), así que se llama
  // después de que el borrado haya confirmado.
  await tx(async (c) => {
    await c.q('DELETE FROM services WHERE id = $1', [service.id]);
  });
  await refreshProviderRating(service.provider_id);
  res.json({ message: 'Servicio eliminado' });
}));

router.patch('/:id/toggle', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const service = await ownedService(req);
  const next = !service.is_active;
  // Igual que al crear: contar los activos y reactivar van en la misma transacción con `c`.
  await tx(async (c) => {
    if (next) {
      const { maxServices: max, name: planName } = planDe(service.subscription_plan);
      const count = Number((await c.qOne<{ count: string }>('SELECT COUNT(*) AS count FROM services WHERE provider_id = $1 AND is_active = true', [service.provider_id]))!.count);
      if (max !== null && count >= max) {
        throw new AppError(`Tu plan ${planName} permite ${max} oficio${max === 1 ? '' : 's'} activo${max === 1 ? '' : 's'}. Pausa otro o mejora tu plan.`, 403);
      }
    }
    await c.q('UPDATE services SET is_active = $1, updated_at = now() WHERE id = $2', [next, service.id]);
  });
  res.json({ is_active: next });
}));

export default router;
