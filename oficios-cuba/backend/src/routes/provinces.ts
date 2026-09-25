import { Router } from 'express';
import db from '../db/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const provinces = db.prepare(`
    SELECT id, name, capital, lat, lng, zoom
    FROM provinces
    ORDER BY name
  `).all();

  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ provinces });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const province = db.prepare(`
    SELECT id, name, capital, lat, lng, zoom
    FROM provinces
    WHERE id = ?
  `).get(req.params.id);

  if (!province) {
    return res.status(404).json({ error: 'Provincia no encontrada' });
  }

  const municipalities = db.prepare(`
    SELECT id, name, lat, lng
    FROM municipalities
    WHERE province_id = ?
    ORDER BY name
  `).all(req.params.id);

  res.json({ province, municipalities });
}));

router.get('/:id/municipalities', asyncHandler(async (req, res) => {
  const municipalities = db.prepare(`
    SELECT id, name, lat, lng
    FROM municipalities
    WHERE province_id = ?
    ORDER BY name
  `).all(req.params.id);

  res.set('Cache-Control', 'public, max-age=3600');
  res.json({ municipalities });
}));

export default router;