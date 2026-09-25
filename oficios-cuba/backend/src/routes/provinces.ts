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

  res.json({ municipalities });
}));

router.get('/search/osm', asyncHandler(async (req, res) => {
  const { lat, lng } = req.query;

  if (!lat || !lng) {
    return res.status(400).json({ error: 'Se requieren lat y lng' });
  }

  try {
    const response = await fetch(
      `https://nominatim.openstreetmap.org/reverse?format=json&lat=${lat}&lon=${lng}&addressdetails=1&accept-language=es`,
      { headers: { 'User-Agent': 'OficiosCuba/1.0' } }
    );

    const data = await response.json();

    const province = db.prepare(`
      SELECT id, name, capital, lat, lng, zoom
      FROM provinces
      ORDER BY ABS(lat - ?) + ABS(lng - ?)
      LIMIT 1
    `).get(Number(lat), Number(lng));

    res.json({ osmData: data, nearestProvince: province });
  } catch (error) {
    console.error('OSM reverse geocoding error:', error);
    res.status(500).json({ error: 'Error al consultar OpenStreetMap' });
  }
}));

export default router;