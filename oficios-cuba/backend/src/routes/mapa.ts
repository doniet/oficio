import { Router } from 'express';
import { q, qOne } from '../db/acceso.js';
import { CATEGORIAS_SQL, CON_CATALOGO_SQL, CON_NEGOCIO_SQL, LAT_SERVIDA, LNG_SERVIDA, PLAN_WEIGHT_SQL } from '../db/index.js';
import { asyncHandler, AppError } from '../middleware/errorHandler.js';
import { categoriaColumna, queryTextos } from '../lib/entrada.js';
import { consultaSQL, termino } from '../lib/buscador.js';
import { conMargen, leerBbox, tamanoCelda } from '../lib/mapa.js';
import { segunPlan } from './providers.js';

const router = Router();

const TOPE = 200;
const PESTANAS = ['servicios', 'productos', 'negocios'] as const;

// LAT_SERVIDA/LNG_SERVIDA (db/index.ts) son la única definición de «la coordenada que se
// publica»: la presencia de un perfil en este listado depende de lo mismo que se sirve. Antes se
// filtraba por pp.lat/pp.lng (lo guardado) y se redondeaba después, en JS: eso deja un oráculo —
// con un rectángulo del tamaño que se quiera (leerBbox no impone mínimo) se puede localizar por
// bisección la casa exacta de un perfil `zona`, con solo mirar si aparece o no.

// Una línea de precio para el marcador. Sin conversión de moneda (esa la hace shared/formato.ts,
// pensada para las fichas del cliente y no accesible desde el backend): basta con la cifra tal
// como se guardó — el mapa es una vista de bulto, no la ficha completa.
function textoPrecio(s: { price_min: number | null; price_max: number | null; price_type: string; price_currency: string }) {
  if (s.price_type === 'negotiable' || (s.price_min == null && s.price_max == null)) return 'precio acordado';
  const miles = (n: number) => String(Math.round(n)).replace(/\B(?=(\d{3})+(?!\d))/g, ' ');
  const cifra = (n: number) => `${miles(n)} ${s.price_currency === 'USD' ? 'USD' : 'CUP'}`;
  const { price_min: min, price_max: max } = s;
  const monto = min != null && max != null && max !== min ? `${cifra(min)}–${cifra(max)}` : cifra((min ?? max) as number);
  const sufijo = s.price_type === 'hourly' ? ' / hora' : s.price_type === 'daily' ? ' / día' : '';
  return `${monto}${sufijo}`;
}

// `resumen` es la línea que se ve en el marcador y en la ficha asomada: SIEMPRE una cadena (el
// contrato de los cuatro tipos — shared, frontend y los dos móviles — es `resumen: string`, nunca
// un objeto). Antes cada rama devolvía una forma distinta ({titulo,precio_min,…} / {articulos} /
// {categoria}) y los tres consumidores la pintaban como hijo de React directo: cualquier punto
// del mapa reventaba la página. El propio test de este archivo fija `typeof resumen === 'string'`
// para que esto no pueda volver a desviarse sin que la suite lo note.

// El servicio activo más reciente de un perfil: uno recién publicado es el más probable de
// seguir vigente. Desempate por id para que dos peticiones iguales den siempre el mismo resumen.
async function resumenServicio(providerId: string) {
  const s = await qOne<
    { title: string; price_min: number | null; price_max: number | null; price_type: string; price_currency: string }
  >(`
    SELECT title, price_min, price_max, price_type, price_currency FROM services
    WHERE provider_id = $1 AND is_active = true ORDER BY created_at DESC, id LIMIT 1
  `, [providerId]);
  if (!s) return '';
  return `${s.title} · ${textoPrecio(s)}`;
}

async function resumenProductos(providerId: string) {
  // count(*) llega como cadena (bigint de pg): Number(...) antes de usarlo.
  const row = await qOne<{ n: string }>(`
    SELECT count(*) AS n FROM catalog_items ci JOIN provider_profiles pp ON ci.provider_id = pp.id
    WHERE ci.provider_id = $1 AND ci.available = true AND ${CON_CATALOGO_SQL}
  `, [providerId]);
  const n = Number(row?.n ?? 0);
  if (!n) return '';
  return `${n} ${n === 1 ? 'artículo' : 'artículos'}`;
}

// La categoría principal de un negocio: se reusa CATEGORIAS_SQL de db/index.ts (la misma que
// arma PUBLIC_COLUMNS en providers.ts) en vez de escribir otra forma de sacarla. Ya es jsonb:
// llega parseada, nada de JSON.parse.
async function resumenNegocio(providerId: string) {
  const row = await qOne<{ categorias: string[] | null }>(
    `SELECT ${CATEGORIAS_SQL} AS categorias FROM provider_profiles pp WHERE pp.id = $1`, [providerId],
  );
  const categorias = Array.isArray(row?.categorias) ? row!.categorias : [];
  return categorias[0] ?? '';
}

async function resumenDe(providerId: string, tab: string): Promise<string> {
  if (tab === 'negocios') return resumenNegocio(providerId);
  if (tab === 'productos') return resumenProductos(providerId);
  return resumenServicio(providerId);
}

/**
 * El filtro de perfiles visibles del mapa. Lo comparten GET /mapa y GET /mapa/celda: si cada uno
 * escribiera el suyo, la lista de una celda podría no coincidir con el «+N» que la anuncia, y el
 * usuario vería «5 más» y le saldrían cuatro. Es la misma razón por la que el tamaño de celda lo
 * calcula el servidor en los dos sitios.
 *
 * Los parámetros que devuelve arrancan en $1 y son autocontenidos: quien arme la consulta final
 * añade los suyos (celda, cy/cx, el LIMIT) DESPUÉS, con `params.push(...)` y referenciando
 * `params.length` — el mismo patrón que ya usan providers.ts/services.ts/catalog.ts.
 */
function filtroDeVisibles(
  tab: string, texto: string | undefined, category: string | undefined,
  pedido: { sur: number; norte: number; oeste: number; este: number },
) {
  // Se filtra SOLO por la coordenada publicada (pp.punto_pub), nunca por la guardada (pp.lat/
  // pp.lng). Ahí está el oráculo: con rectángulos cada vez más pequeños sobre la coordenada real
  // se podría acorralar por bisección la casa de un perfil «zona», anulando la única promesa de
  // esa opción. ST_Intersects usa el índice GiST idx_pp_punto_pub (esquema.sql), así que sigue
  // siendo un filtro indexable, no un simple BETWEEN.
  //
  // ST_MakeEnvelope toma (oeste, sur, este, norte) — un orden DISTINTO del bbox=sur,oeste,norte,
  // este que recibe la API (leerBbox). Equivocar el orden da un rectángulo vacío EN SILENCIO, sin
  // error: el mapa saldría sin puntos y parecería que no hay negocios, no que el filtro está mal.
  let where = `WHERE pp.is_active = true AND pp.show_on_map = true
    AND pp.punto_pub IS NOT NULL
    AND ST_Intersects(pp.punto_pub, ST_MakeEnvelope($1, $2, $3, $4, 4326)::geography)`;
  const params: unknown[] = [pedido.oeste, pedido.sur, pedido.este, pedido.norte];

  if (tab === 'negocios') where += ` AND pp.kind = 'negocio' AND ${CON_NEGOCIO_SQL}`;

  // `texto` tiene que buscar lo mismo que busca la lista de esa pestaña (services.ts /
  // catalog.ts): si no, cambiar de lista a mapa con un término escrito casi siempre vacía el
  // mapa, porque el término coincide con un servicio o un artículo, no con el nombre del
  // negocio. Negocios es la excepción a propósito: ahí no hay un "servicio que coincide" que
  // mostrar, así que sí busca en los campos del propio perfil (pp.busca).
  if (tab === 'servicios') {
    // El LIKE original también buscaba en el nombre del negocio y en el de la categoría (y su
    // categoría padre): mismas cuatro columnas que la lista (services.ts), o cambiar de vista con
    // un término escrito podría vaciar el mapa por una coincidencia que la lista sí encontraba.
    where += ` AND EXISTS (SELECT 1 FROM services s
      LEFT JOIN categories c ON s.category_id = c.id LEFT JOIN categories parent ON c.parent_id = parent.id
      WHERE s.provider_id = pp.id AND s.is_active = true`;
    const idx = params.length + 1;
    const t = termino(texto, 's.busca', idx);
    if (t) {
      where += ` AND (${t.sql} OR pp.busca @@ ${consultaSQL(idx)}
        OR c.busca @@ ${consultaSQL(idx)} OR parent.busca @@ ${consultaSQL(idx)})`;
      params.push(...t.params);
    }
    where += ')';
  }
  if (tab === 'productos') {
    // `catalog_items` NO tiene `is_active`: la visibilidad es `available` más el tope del plan.
    where += ` AND EXISTS (SELECT 1 FROM catalog_items ci
      WHERE ci.provider_id = pp.id AND ci.available = true AND ${CON_CATALOGO_SQL}`;
    // pp.business_name igual que catalog.ts (/catalog/search, la que usa la pestaña Productos).
    const idx = params.length + 1;
    const t = termino(texto, 'ci.busca', idx);
    if (t) {
      where += ` AND (${t.sql} OR pp.busca @@ ${consultaSQL(idx)})`;
      params.push(...t.params);
    }
    where += ')';
  }
  if (category) {
    // category acepta un uuid o un slug: ver categoriaColumna (misma trampa que providers.ts/services.ts).
    const campo = categoriaColumna(category);
    params.push(category);
    const n = params.length;
    where += ` AND pp.id IN (SELECT s.provider_id FROM services s JOIN categories c ON s.category_id = c.id
      WHERE s.is_active = true AND (c.${campo} = $${n} OR c.parent_id IN (SELECT id FROM categories WHERE ${campo} = $${n})))`;
  }
  if (tab === 'negocios') {
    // El LIKE original también buscaba en el nombre del dueño (u.full_name): u ya está unida en
    // la CTE de fuera (FROM provider_profiles pp JOIN users u ON pp.user_id = u.id).
    const idx = params.length + 1;
    const t = termino(texto, 'pp.busca', idx);
    if (t) {
      where += ` AND (${t.sql} OR u.busca @@ ${consultaSQL(idx)})`;
      params.push(...t.params);
    }
  }
  return { where, params };
}

router.get('/', asyncHandler(async (req, res) => {
  // Un tab que no sea una cadena (p. ej. ?tab[x]=1) no puede caer en el valor por defecto en
  // silencio: es justo el filtro que separa negocios de oficios, y la spec pide fallar, no adivinar.
  if (req.query.tab !== undefined && typeof req.query.tab !== 'string') {
    throw new AppError('Pestaña no válida', 400);
  }
  const { tab = 'servicios', q: texto, category } = queryTextos(req.query, ['tab', 'q', 'category'] as const);
  if (!PESTANAS.includes(tab as (typeof PESTANAS)[number])) {
    throw new AppError('Pestaña no válida', 400);
  }
  const visible = leerBbox(typeof req.query.bbox === 'string' ? req.query.bbox : undefined);
  const celda = tamanoCelda(visible);
  const pedido = conMargen(visible);

  const { where, params } = filtroDeVisibles(tab, texto, category, pedido);
  // celda y el LIMIT se añaden DESPUÉS de los del filtro, referenciados por su propia posición:
  // el mismo parámetro $celdaParam se reusa dos veces (cy y cx), algo que el `?` posicional de
  // SQLite no permitía.
  const celdaParam = params.length + 1;
  params.push(celda);
  const limiteParam = params.length + 1;
  params.push(TOPE + 1);

  // Las dos CTE se aliasan `pp` a propósito: PLAN_WEIGHT_SQL lleva el prefijo `pp.` escrito
  // dentro, así que sin el alias el ORDER BY de fuera fallaría con «no such column».
  const orden = `${PLAN_WEIGHT_SQL} DESC, pp.rating DESC, pp.review_count DESC, pp.id`;
  const filas = await q<any>(`
    WITH visibles AS (
      SELECT pp.id, pp.kind, pp.subscription_plan, pp.map_precision, ${LAT_SERVIDA} AS lat, ${LNG_SERVIDA} AS lng,
             pp.business_name, pp.rating, pp.review_count, u.full_name AS owner_name,
             floor(${LAT_SERVIDA} / $${celdaParam})::int AS cy, floor(${LNG_SERVIDA} / $${celdaParam})::int AS cx
        FROM provider_profiles pp JOIN users u ON pp.user_id = u.id
      ${where}
    ), rankeadas AS (
      SELECT pp.*, ROW_NUMBER() OVER (PARTITION BY pp.cy, pp.cx ORDER BY ${orden}) AS pos,
                   COUNT(*)     OVER (PARTITION BY pp.cy, pp.cx) AS en_celda
        FROM visibles pp
    )
    SELECT * FROM rankeadas pp WHERE pp.pos = 1 ORDER BY ${orden} LIMIT $${limiteParam}
  `, params);

  const hay_mas = filas.length > TOPE;
  // resumenDe() consulta la base una vez por punto, hasta TOPE veces por petición: es un N+1 real
  // y deliberadamente no se toca aquí (fuera de alcance de este porte; resuelto en el Plan 2,
  // precalculando el resumen en el índice de búsqueda). Promise.all mantiene el mismo número de
  // consultas que antes, solo concurrentes en vez de secuenciales — lo que pide portar un `.map()`
  // síncrono a async, no una optimización.
  const puntos = await Promise.all(filas.slice(0, TOPE).map(async (f) => ({
    id: f.id,
    // `pp.kind` a secas es el dato guardado, no lo que el plan actual permite mostrar: un negocio
    // que bajó de plan sigue teniendo kind='negocio' en la fila hasta que alguien lo edite. El
    // filtro de la pestaña Negocios ya usa CON_NEGOCIO_SQL (por eso no aparece ahí), pero fuera de
    // esa pestaña la etiqueta pasaba cruda — segunPlan() es la única fuente de verdad de "qué kind
    // se le muestra a la gente" (routes/providers.ts, listados y ficha), así que el mapa la reusa
    // en vez de escribir una tercera forma de decidirlo.
    tipo: segunPlan(f).kind as 'oficio' | 'negocio',
    nombre: f.business_name || f.owner_name,
    lat: f.lat,
    lng: f.lng,
    plan: f.subscription_plan === 'premium' ? 'pro' : f.subscription_plan,
    // Sin esta bandera el cliente no puede dibujar distinto lo aproximado, y un negocio con local
    // real se vería tan difuso como quien se esconde. Revela una preferencia, no una ubicación.
    aproximado: f.map_precision === 'zona',
    // COUNT(*) OVER(...) llega como cadena (bigint de pg): Number(...) antes de restar.
    detras: Number(f.en_celda) - 1,
    // Los índices de celda VIENEN del servidor y el cliente los reenvía a /mapa/celda tal cual.
    // Recalcularlos en el cliente sería definir el mismo número en dos sitios: floor(x/celda) en
    // SQL y Math.floor en JS coinciden hoy, pero es exactamente el error que esta entrega ya
    // corrigió varias veces. No añaden información: salen de lat/lng y celda, que ya viajan.
    cy: f.cy,
    cx: f.cx,
    resumen: await resumenDe(f.id, tab),
  })));

  res.json({ puntos, celda, hay_mas });
}));

// Los negocios de UNA celda, con los mismos filtros. Hasta ahora `detras` era solo una insignia:
// si una celda tenía cinco negocios veías uno y los otros cuatro eran inalcanzables desde el mapa.
const TOPE_CELDA = 50;

router.get('/celda', asyncHandler(async (req, res) => {
  if (req.query.tab !== undefined && typeof req.query.tab !== 'string') {
    throw new AppError('Pestaña no válida', 400);
  }
  const { tab = 'servicios', q: texto, category } = queryTextos(req.query, ['tab', 'q', 'category'] as const);
  if (!PESTANAS.includes(tab as (typeof PESTANAS)[number])) {
    throw new AppError('Pestaña no válida', 400);
  }
  const cy = Number(req.query.cy);
  const cx = Number(req.query.cx);
  if (!Number.isInteger(cy) || !Number.isInteger(cx)) {
    throw new AppError('Celda no válida', 400);
  }

  // El tamaño de celda lo recalcula el servidor del mismo bbox y con la misma función que /mapa:
  // si viniera del cliente, dos definiciones del mismo número acabarían separándose y la lista
  // dejaría de coincidir con el «+N» que la anunció.
  const visible = leerBbox(typeof req.query.bbox === 'string' ? req.query.bbox : undefined);
  const celda = tamanoCelda(visible);
  const pedido = conMargen(visible);
  const { where, params } = filtroDeVisibles(tab, texto, category, pedido);

  const celdaParam = params.length + 1;
  params.push(celda);
  const cyParam = params.length + 1;
  params.push(cy);
  const cxParam = params.length + 1;
  params.push(cx);
  const limiteParam = params.length + 1;
  params.push(TOPE_CELDA + 1);

  const orden = `${PLAN_WEIGHT_SQL} DESC, pp.rating DESC, pp.review_count DESC, pp.id`;
  const filas = await q<any>(`
    WITH visibles AS (
      SELECT pp.id, pp.kind, pp.subscription_plan, pp.map_precision, ${LAT_SERVIDA} AS lat, ${LNG_SERVIDA} AS lng,
             pp.business_name, pp.rating, pp.review_count, u.full_name AS owner_name,
             floor(${LAT_SERVIDA} / $${celdaParam})::int AS cy, floor(${LNG_SERVIDA} / $${celdaParam})::int AS cx
        FROM provider_profiles pp JOIN users u ON pp.user_id = u.id
      ${where}
    )
    SELECT * FROM visibles pp WHERE pp.cy = $${cyParam} AND pp.cx = $${cxParam} ORDER BY ${orden} LIMIT $${limiteParam}
  `, params);

  const hay_mas = filas.length > TOPE_CELDA;
  const puntos = await Promise.all(filas.slice(0, TOPE_CELDA).map(async (f) => ({
    id: f.id,
    tipo: segunPlan(f).kind as 'oficio' | 'negocio',
    nombre: f.business_name || f.owner_name,
    lat: f.lat,
    lng: f.lng,
    plan: f.subscription_plan === 'premium' ? 'pro' : f.subscription_plan,
    aproximado: f.map_precision === 'zona',
    detras: 0,
    cy: f.cy,
    cx: f.cx,
    resumen: await resumenDe(f.id, tab),
  })));

  res.json({ puntos, celda, hay_mas });
}));

export default router;
