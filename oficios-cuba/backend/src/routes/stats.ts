import { Router } from 'express';
import db from '../db/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';
import { textoQuery } from '../lib/entrada.js';

const router = Router();

router.get('/', asyncHandler(async (_req, res) => {
  const row = db.prepare(`
    SELECT
      (SELECT COUNT(*) FROM provider_profiles WHERE is_active = 1) AS providers,
      (SELECT COUNT(*) FROM services s JOIN provider_profiles pp ON s.provider_id = pp.id WHERE s.is_active = 1 AND pp.is_active = 1) AS services,
      (SELECT COUNT(DISTINCT province_id) FROM provider_profiles WHERE is_active = 1) AS provinces,
      (SELECT COUNT(*) FROM reviews) AS reviews,
      (SELECT ROUND(AVG(rating), 1) FROM reviews) AS avg_rating
  `).get();
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ stats: row });
}));

// Conteo por categoría principal (incluye los servicios de sus subcategorías).
router.get('/categories', asyncHandler(async (req, res) => {
  const province_id = textoQuery(req.query.province_id);
  const params: unknown[] = [];
  let provinceFilter = '';
  if (province_id) {
    provinceFilter = 'AND pp.province_id = ?';
    params.push(province_id);
  }
  const rows = db.prepare(`
    SELECT parent.id, parent.name, parent.slug, parent.icon, parent.sort_order,
      COUNT(DISTINCT s.id) AS service_count,
      COUNT(DISTINCT s.provider_id) AS provider_count
    FROM categories parent
    LEFT JOIN categories child ON child.parent_id = parent.id
    LEFT JOIN services s ON s.category_id IN (parent.id, child.id) AND s.is_active = 1
      AND EXISTS (SELECT 1 FROM provider_profiles pp WHERE pp.id = s.provider_id AND pp.is_active = 1 ${provinceFilter})
    WHERE parent.parent_id IS NULL
    GROUP BY parent.id
    ORDER BY parent.sort_order
  `).all(...params);
  res.set('Cache-Control', 'public, max-age=60');
  res.json({ categories: rows });
}));

export default router;
