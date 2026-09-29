import { Router } from 'express';
import { q, qOne } from '../db/acceso.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { textoQuery } from '../lib/entrada.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const row = await qOne<{
    providers: string; services: string; provinces: string; reviews: string; avg_rating: string | null;
  }>(`
    SELECT
      (SELECT COUNT(*) FROM provider_profiles WHERE is_active = true) AS providers,
      (SELECT COUNT(*) FROM services s JOIN provider_profiles pp ON s.provider_id = pp.id WHERE s.is_active = true AND pp.is_active = true) AS services,
      (SELECT COUNT(DISTINCT province_id) FROM provider_profiles WHERE is_active = true) AS provinces,
      (SELECT COUNT(*) FROM reviews) AS reviews,
      (SELECT ROUND(AVG(rating), 1) FROM reviews) AS avg_rating
  `);
  // Los COUNT(*) llegan como cadena (bigint de pg); AVG/ROUND también, como numeric.
  const stats = {
    providers: Number(row!.providers),
    services: Number(row!.services),
    provinces: Number(row!.provinces),
    reviews: Number(row!.reviews),
    avg_rating: row!.avg_rating == null ? null : Number(row!.avg_rating),
  };
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ stats });
}));

// Conteo por categoría principal (incluye los servicios de sus subcategorías).
router.get('/categories', asyncHandler(async (req, res) => {
  const province_id = textoQuery(req.query.province_id);
  const params: unknown[] = [];
  let provinceFilter = '';
  if (province_id) {
    params.push(province_id);
    provinceFilter = `AND pp.province_id = $${params.length}`;
  }
  const rows = await q<{ id: string; name: string; slug: string; icon: string | null; sort_order: number; service_count: string; provider_count: string }>(`
    SELECT parent.id, parent.name, parent.slug, parent.icon, parent.sort_order,
      COUNT(DISTINCT s.id) AS service_count,
      COUNT(DISTINCT s.provider_id) AS provider_count
    FROM categories parent
    LEFT JOIN categories child ON child.parent_id = parent.id
    LEFT JOIN services s ON s.category_id IN (parent.id, child.id) AND s.is_active = true
      AND EXISTS (SELECT 1 FROM provider_profiles pp WHERE pp.id = s.provider_id AND pp.is_active = true ${provinceFilter})
    WHERE parent.parent_id IS NULL
    GROUP BY parent.id
    ORDER BY parent.sort_order
  `, params);
  const categories = rows.map((r) => ({ ...r, service_count: Number(r.service_count), provider_count: Number(r.provider_count) }));
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ categories });
}));

export default router;
