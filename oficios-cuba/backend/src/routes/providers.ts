import { Router } from 'express';
import { v4 as uuidv4 } from 'uuid';
import { z } from 'zod';
import { CATEGORIAS_SQL, CON_NEGOCIO_SQL, LAT_SERVIDA, LNG_SERVIDA, parseImages, PLAN_WEIGHT_SQL } from '../db/index.js';
import { q, qOne, tx } from '../db/acceso.js';
import { hayQueRecalcular, puntoPublico } from '../lib/ubicacion.js';
import { authMiddleware, AuthRequest, optionalAuth, requireProvider } from '../middleware/auth.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { imagenPermitida, queryTextos } from '../lib/entrada.js';
import { planDe } from '../config.js';

const router = Router();

const blankToUndefined = (v: unknown) => (typeof v === 'string' && v.trim() === '' ? undefined : v);
const optionalText = (max: number) => z.preprocess(blankToUndefined, z.string().trim().max(max).optional());

const providerProfileSchema = z.object({
  business_name: z.preprocess(blankToUndefined, z.string().trim().min(2, 'El nombre del negocio es muy corto').max(80).optional()),
  description: optionalText(2000),
  province_id: z.string().uuid('Elige una provincia'),
  municipality_id: z.preprocess(blankToUndefined, z.string().uuid().optional()),
  address: optionalText(200),
  lat: z.number().min(19).max(24).optional(),
  lng: z.number().min(-85.5).max(-73.5).optional(),
  whatsapp: z.preprocess(blankToUndefined, z.string().trim().regex(/^\+?[\d\s-]{8,20}$/, 'Teléfono no válido').optional()),
  contact_mode: z.enum(['whatsapp', 'call', 'both']).default('whatsapp'),
  kind: z.enum(['oficio', 'negocio']).default('oficio'),
  horario: optionalText(120),
  gallery: z.array(z.string().max(500)).max(30).optional(),
  show_on_map: z.boolean().default(false),
  map_precision: z.enum(['exacta', 'zona']).default('exacta'),
  telegram: optionalText(40),
  email_contact: z.preprocess(blankToUndefined, z.string().trim().email('Email de contacto no válido').optional()),
  years_experience: z.number().int().min(0).max(70).optional(),
  service_area_ids: z.array(z.string().uuid()).max(60).optional(),
});

const PUBLIC_COLUMNS = `
  pp.id, pp.business_name, pp.description, pp.province_id, pp.municipality_id, pp.years_experience,
  pp.rating, pp.review_count, pp.subscription_plan, pp.created_at, pp.kind, pp.contact_mode, pp.gallery,
  p.name AS province_name, m.name AS municipality_name,
  u.full_name AS owner_name, u.avatar_url,
  (SELECT COUNT(*) FROM services s WHERE s.provider_id = pp.id AND s.is_active = true) AS service_count,
  ${CATEGORIAS_SQL} AS categories,
  (SELECT s.images FROM services s WHERE s.provider_id = pp.id AND s.is_active = true AND s.images IS NOT NULL AND s.images <> '[]'::jsonb ORDER BY s.created_at LIMIT 1) AS cover_images
`;

const PUBLIC_JOINS = `
  FROM provider_profiles pp
  JOIN users u ON pp.user_id = u.id
  LEFT JOIN provinces p ON pp.province_id = p.id
  LEFT JOIN municipalities m ON pp.municipality_id = m.id
`;

// Lo que el plan vigente permite mostrar: al bajar de plan las fotos y el negocio no se borran,
// solo dejan de verse.
export function segunPlan(row: any) {
  const plan = planDe(row.subscription_plan);
  return {
    subscription_plan: row.subscription_plan === 'premium' ? 'pro' : row.subscription_plan,
    kind: plan.negocio ? row.kind ?? 'oficio' : 'oficio',
    gallery: parseImages(row.gallery).slice(0, plan.maxPhotos),
    has_chat: plan.chat,
    has_agenda: plan.agenda,
    photos_allowed: plan.maxPhotos > 0,
  };
}

function toCard(row: any) {
  const { cover_images, categories, gallery: _g, service_count, ...rest } = row;
  // CATEGORIAS_SQL ya devuelve jsonb (Tarea 5): un array listo, o null cuando el perfil no tiene
  // oficios activos. Nada de JSON.parse.
  const cats: string[] = Array.isArray(categories) ? categories : [];
  const visible = segunPlan(row);
  const cover = visible.photos_allowed ? visible.gallery[0] ?? parseImages(cover_images)[0] ?? null : null;
  const { gallery: _v, photos_allowed: _p, ...flags } = visible;
  // COUNT(*) llega como cadena (bigint de pg).
  return { ...rest, service_count: Number(service_count), ...flags, categories: cats, cover };
}

router.get('/', asyncHandler(async (req, res) => {
  const { province_id, category, q: texto, sort = 'relevance', kind } = queryTextos(req.query, ['province_id', 'category', 'q', 'sort', 'kind'] as const);
  const page = Math.max(1, Number(req.query.page) || 1);
  const limit = Math.min(48, Math.max(1, Number(req.query.limit) || 12));

  let where = 'WHERE pp.is_active = true';
  const params: unknown[] = [];
  if (kind === 'negocio') where += ` AND pp.kind = 'negocio' AND ${CON_NEGOCIO_SQL}`;
  else if (kind === 'oficio') where += ` AND (pp.kind = 'oficio' OR NOT (${CON_NEGOCIO_SQL}))`;
  else if (kind) throw new AppError('Tipo de perfil no válido', 400);
  if (province_id) { params.push(province_id); where += ` AND pp.province_id = $${params.length}`; }
  if (category) {
    params.push(category, category, category, category);
    const n = params.length;
    where += ` AND pp.id IN (SELECT s.provider_id FROM services s JOIN categories c ON s.category_id = c.id
      WHERE s.is_active = true AND (c.id = $${n - 3} OR c.slug = $${n - 2} OR c.parent_id IN (SELECT id FROM categories WHERE id = $${n - 1} OR slug = $${n})))`;
  }
  if (texto && texto.trim()) {
    const term = `%${texto.trim()}%`;
    params.push(term, term, term);
    const n = params.length;
    where += ` AND (pp.business_name ILIKE $${n - 2} OR pp.description ILIKE $${n - 1} OR u.full_name ILIKE $${n})`;
  }

  // NULLS LAST explícito: pp.rating no admite NULL hoy (DEFAULT 0), pero SQLite ponía los NULL
  // primero en ASC y Postgres los pone últimos, así que cualquier ORDER BY sobre una columna que
  // algún día vuelva a admitir NULL cambiaría de orden en silencio si esto no estuviera fijado.
  const orders: Record<string, string> = {
    relevance: `${PLAN_WEIGHT_SQL} DESC, pp.rating DESC NULLS LAST, pp.review_count DESC`,
    rating: 'pp.rating DESC NULLS LAST, pp.review_count DESC',
    reviews: 'pp.review_count DESC',
    newest: 'pp.created_at DESC',
  };

  const total = Number((await qOne<{ count: string }>(`SELECT COUNT(*) AS count ${PUBLIC_JOINS} ${where}`, params))!.count);
  const limitParams = [...params, limit, (page - 1) * limit];
  const rows = await q<any>(
    `SELECT ${PUBLIC_COLUMNS} ${PUBLIC_JOINS} ${where} ORDER BY ${orders[sort] ?? orders.relevance} LIMIT $${limitParams.length - 1} OFFSET $${limitParams.length}`,
    limitParams,
  );

  res.json({ providers: rows.map(toCard), pagination: { page, limit, total, totalPages: Math.max(1, Math.ceil(total / limit)) } });
}));

router.get('/featured', asyncHandler(async (req, res) => {
  const limit = Math.min(12, Math.max(1, Number(req.query.limit) || 6));
  const rows = await q<any>(`
    SELECT ${PUBLIC_COLUMNS} ${PUBLIC_JOINS}
    WHERE pp.is_active = true
      AND EXISTS (SELECT 1 FROM services s WHERE s.provider_id = pp.id AND s.is_active = true)
    ORDER BY ${PLAN_WEIGHT_SQL} DESC, pp.rating DESC NULLS LAST, pp.review_count DESC
    LIMIT $1
  `, [limit]);
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ providers: rows.map(toCard) });
}));

async function serviceAreasOf(providerId: string) {
  return q(`
    SELECT sa.id, sa.municipality_id, m.name AS municipality_name, p.name AS province_name
    FROM service_areas sa
    JOIN municipalities m ON sa.municipality_id = m.id
    JOIN provinces p ON m.province_id = p.id
    WHERE sa.provider_id = $1 ORDER BY m.name
  `, [providerId]);
}

router.get('/me/profile', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const provider = await qOne<any>(`
    SELECT pp.*, p.name AS province_name, m.name AS municipality_name, u.full_name AS owner_name, u.avatar_url
    FROM provider_profiles pp
    JOIN users u ON pp.user_id = u.id
    LEFT JOIN provinces p ON pp.province_id = p.id
    LEFT JOIN municipalities m ON pp.municipality_id = m.id
    WHERE pp.user_id = $1
  `, [req.user!.id]);
  if (!provider) throw new AppError('Perfil de proveedor no encontrado', 404);
  res.json({ provider: { ...provider, gallery: parseImages(provider.gallery), agenda: undefined }, serviceAreas: await serviceAreasOf(provider.id), limits: planDe(provider.subscription_plan) });
}));

router.put('/me/profile', authMiddleware, requireProvider, asyncHandler(async (req: AuthRequest, res) => {
  const data = providerProfileSchema.parse(req.body);
  // lat/lng/map_precision/map_lat_pub vienen para decidir si hay que volver a sortear el punto
  // publicado: solo cuando el dueño mueve su ubicación o cambia de precisión, nunca al guardar
  // el resto del perfil, o su pin saltaría de sitio cada vez que corrige un teléfono.
  // map_lat_pub/map_lng_pub ya no son columnas (la migración las sustituyó por punto_pub,
  // geography): se sacan aquí con ST_Y/ST_X para no tocar lib/ubicacion.ts, que sigue esperando
  // esa forma exacta de objeto.
  const provider = await qOne<{
    id: string; subscription_plan: string; gallery: unknown; lat: number | null; lng: number | null;
    map_precision: string | null; map_lat_pub: number | null; map_lng_pub: number | null;
  }>(`
    SELECT id, subscription_plan, gallery, lat, lng, map_precision,
      ST_Y(punto_pub::geometry) AS map_lat_pub, ST_X(punto_pub::geometry) AS map_lng_pub
    FROM provider_profiles WHERE user_id = $1
  `, [req.user!.id]);
  if (!provider) throw new AppError('Perfil de proveedor no encontrado', 404);
  const plan = planDe(provider.subscription_plan);

  if (data.kind === 'negocio' && !plan.negocio) throw new AppError('Registrar un negocio es del plan Profesional', 403);
  const galeriaActual = parseImages(provider.gallery);
  const gallery = data.gallery ?? galeriaActual;
  if (gallery.length > plan.maxPhotos) {
    throw new AppError(plan.maxPhotos ? `Tu plan ${plan.name} permite ${plan.maxPhotos} fotos del negocio` : `El plan ${plan.name} no incluye fotos del negocio. Mejora tu plan para subirlas.`, 403);
  }
  // imagenPermitida consulta la base y es async: un .some() con callback async siempre da true
  // (la Promise es truthy) y la validación se saltaría en silencio, sin que el typecheck avise
  // (strict:false). Se recorre con un bucle en su lugar.
  for (const url of gallery) {
    if (!(await imagenPermitida(url, req.user!.id, galeriaActual))) {
      throw new AppError('Alguna foto no es válida: súbela desde el formulario', 400);
    }
  }
  // El plan Gratis solo lleva nombre, logo, descripción, dirección y teléfono.
  if (!plan.maxPhotos) { data.telegram = undefined; data.email_contact = undefined; }

  if (!(await qOne('SELECT 1 FROM provinces WHERE id = $1', [data.province_id]))) throw new AppError('Provincia no válida', 400);
  if (data.municipality_id) {
    const ok = await qOne('SELECT 1 FROM municipalities WHERE id = $1 AND province_id = $2', [data.municipality_id, data.province_id]);
    if (!ok) throw new AppError('El municipio no pertenece a la provincia elegida', 400);
  }
  if (data.service_area_ids?.length) {
    const ids = [...new Set(data.service_area_ids)];
    const placeholders = ids.map((_, i) => `$${i + 1}`).join(',');
    const row = await qOne<{ n: string }>(`SELECT count(*) AS n FROM municipalities WHERE id IN (${placeholders})`, ids);
    if (Number(row?.n ?? 0) !== ids.length) throw new AppError('Alguna zona de servicio no existe', 400);
  }

  // La coordenada publicada: se sortea aquí, una vez, y solo si cambió lo que la define. Este es
  // el ÚNICO sitio donde un proveedor puede mover su punto, así que es el único que tiene que
  // recalcularla; un test afirma que no queda ningún perfil con punto y sin coordenada pública.
  const nueva = { lat: data.lat ?? null, lng: data.lng ?? null, map_precision: data.map_precision };
  const pub = hayQueRecalcular(provider, nueva)
    ? puntoPublico(nueva.lat, nueva.lng, data.map_precision)
    : { lat: provider.map_lat_pub, lng: provider.map_lng_pub };

  // Formulario completo: los campos vacíos se guardan como NULL para poder borrarlos.
  await tx(async (c) => {
    await c.q(`
      UPDATE provider_profiles SET business_name = $1, description = $2, province_id = $3, municipality_id = $4, address = $5,
        lat = $6, lng = $7,
        punto_pub = CASE WHEN $8::double precision IS NULL THEN NULL ELSE ST_SetSRID(ST_MakePoint($9::double precision, $8::double precision), 4326)::geography END,
        whatsapp = $10, telegram = $11, email_contact = $12, years_experience = $13,
        contact_mode = $14, kind = $15, horario = $16, gallery = $17, show_on_map = $18, map_precision = $19, updated_at = now()
      WHERE id = $20
    `, [
      data.business_name ?? null, data.description ?? null, data.province_id, data.municipality_id ?? null, data.address ?? null,
      data.lat ?? null, data.lng ?? null, pub.lat, pub.lng,
      data.whatsapp ?? null, data.telegram ?? null, data.email_contact ?? null,
      data.years_experience ?? 0, data.contact_mode, data.kind, data.kind === 'negocio' ? data.horario ?? null : null,
      // La regla de negocio no es solo el tipo (boolean en vez de 1/0): show_on_map solo se marca
      // si además hay coordenadas. Un show_on_map=true sin punto dejaría el mapa filtrando por
      // punto_pub NULL, es decir, invisible pero con la bandera encendida — inconsistente.
      JSON.stringify(gallery), data.show_on_map && data.lat != null && data.lng != null, data.map_precision,
      provider.id,
    ]);

    if (data.service_area_ids) {
      await c.q('DELETE FROM service_areas WHERE provider_id = $1', [provider.id]);
      for (const muniId of data.service_area_ids) {
        await c.q('INSERT INTO service_areas (id, provider_id, municipality_id) VALUES ($1, $2, $3) ON CONFLICT DO NOTHING', [uuidv4(), provider.id, muniId]);
      }
    }
  });

  const updated = await qOne<any>(`
    SELECT pp.*, p.name AS province_name, m.name AS municipality_name
    FROM provider_profiles pp
    LEFT JOIN provinces p ON pp.province_id = p.id
    LEFT JOIN municipalities m ON pp.municipality_id = m.id
    WHERE pp.id = $1
  `, [provider.id]);
  res.json({ provider: { ...updated, gallery: parseImages(updated.gallery), agenda: undefined }, serviceAreas: await serviceAreasOf(provider.id), limits: plan });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  // lat/lng van por LAT_SERVIDA/LNG_SERVIDA (db/index.ts), no por pp.lat/pp.lng crudos: este
  // endpoint es público y sin autenticar, así que un perfil `zona` tiene que salir redondeado
  // aquí igual que en GET /api/mapa — si no, esta puerta publica la casa exacta que la otra ya
  // protege.
  const provider = await qOne<any>(`
    SELECT ${PUBLIC_COLUMNS}, pp.address, pp.whatsapp, pp.telegram, pp.email_contact, pp.horario,
      ${LAT_SERVIDA} AS lat, ${LNG_SERVIDA} AS lng, pp.show_on_map
    ${PUBLIC_JOINS} WHERE pp.id = $1 AND pp.is_active = true
  `, [req.params.id]);
  if (!provider) throw new AppError('Proveedor no encontrado', 404);
  const visible = segunPlan(provider);

  const services = (await q<any>(`
    SELECT s.id, s.title, s.description, s.price_min, s.price_max, s.price_type, s.price_currency, s.images, s.created_at,
      c.name AS category_name, c.icon AS category_icon, c.slug AS category_slug
    FROM services s JOIN categories c ON s.category_id = c.id
    WHERE s.provider_id = $1 AND s.is_active = true
    ORDER BY s.created_at
  `, [req.params.id])).map((s: any) => {
    const images = parseImages(s.images);
    const { images: _i, ...rest } = s;
    return { ...rest, cover: visible.photos_allowed ? images[0] ?? null : null };
  });

  // reviews.provider_profile_id (Tarea 3): es el id del PERFIL, el nombre ya lo dice; no confundir
  // con provider_id (usuario) de otras tablas.
  const reviews = await q<any>(`
    SELECT r.id, r.rating, r.comment, r.created_at, u.full_name AS client_name, u.avatar_url AS client_avatar, s.title AS service_title
    FROM reviews r JOIN users u ON r.client_id = u.id LEFT JOIN services s ON r.service_id = s.id
    WHERE r.provider_profile_id = $1 ORDER BY r.created_at DESC LIMIT 20
  `, [req.params.id]);

  const distribution = (await q<{ rating: number; count: string }>(
    'SELECT rating, count(*) AS count FROM reviews WHERE provider_profile_id = $1 GROUP BY rating', [req.params.id],
  )).map((d) => ({ rating: d.rating, count: Number(d.count) }));

  // lat/lng solo en el detalle y solo si el profesional marcó su punto en el mapa para que lo encuentren.
  const { lat, lng, show_on_map, ...card } = toCard(provider);
  res.json({
    provider: { ...card, ...(show_on_map ? { lat, lng } : {}), gallery: visible.gallery, horario: visible.kind === 'negocio' ? provider.horario : null },
    services, serviceAreas: await serviceAreasOf(req.params.id), reviews, distribution,
  });
}));

// Un cliente con sesión pulsó WhatsApp o Llamar: queda constancia para poder reseñar después.
router.post('/:id/contact', optionalAuth, asyncHandler(async (req: AuthRequest, res) => {
  const { via } = z.object({ via: z.enum(['whatsapp', 'call']) }).parse(req.body);
  if (req.user?.user_type === 'client' && await qOne('SELECT 1 FROM provider_profiles WHERE id = $1 AND is_active = true', [req.params.id])) {
    await q('INSERT INTO contacts (client_id, provider_id, via, created_at) VALUES ($1, $2, $3, $4) ON CONFLICT DO NOTHING',
      [req.user.id, req.params.id, via, new Date().toISOString()]);
  }
  res.status(204).end();
}));

export default router;
