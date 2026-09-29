import { Router } from 'express';
import { q, qOne } from '../db/acceso.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const provinces = await q(`
    SELECT id, name, capital, lat, lng, zoom
    FROM provinces
    ORDER BY name
  `);

  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ provinces });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const province = await qOne(`
    SELECT id, name, capital, lat, lng, zoom
    FROM provinces
    WHERE id = $1
  `, [req.params.id]);

  if (!province) {
    return res.status(404).json({ error: 'Provincia no encontrada' });
  }

  const municipalities = await q(`
    SELECT id, name, lat, lng
    FROM municipalities
    WHERE province_id = $1
    ORDER BY name
  `, [req.params.id]);

  res.json({ province, municipalities });
}));

router.get('/:id/municipalities', asyncHandler(async (req, res) => {
  const municipalities = await q(`
    SELECT id, name, lat, lng
    FROM municipalities
    WHERE province_id = $1
    ORDER BY name
  `, [req.params.id]);

  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ municipalities });
}));

export default router;
