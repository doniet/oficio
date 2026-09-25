import { Router } from 'express';
import db from '../db/index.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const categories = db.prepare(`
    SELECT id, name, slug, icon, description, parent_id, sort_order
    FROM categories
    WHERE parent_id IS NULL
    ORDER BY sort_order, name
  `).all();

  for (const cat of categories) {
    cat.subcategories = db.prepare(`
      SELECT id, name, slug, icon, description, sort_order
      FROM categories
      WHERE parent_id = ?
      ORDER BY sort_order, name
    `).all(cat.id);
  }

  res.json({ categories });
}));

router.get('/flat', asyncHandler(async (req, res) => {
  const categories = db.prepare(`
    SELECT id, name, slug, icon, description, parent_id, sort_order
    FROM categories
    ORDER BY parent_id NULLS FIRST, sort_order, name
  `).all();

  res.json({ categories });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const category = db.prepare(`
    SELECT id, name, slug, icon, description, parent_id, sort_order
    FROM categories
    WHERE id = ?
  `).get(req.params.id);

  if (!category) {
    return res.status(404).json({ error: 'Categoría no encontrada' });
  }

  category.subcategories = db.prepare(`
    SELECT id, name, slug, icon, description, sort_order
    FROM categories
    WHERE parent_id = ?
    ORDER BY sort_order, name
  `).all(category.id);

  res.json({ category });
}));

router.get('/slug/:slug', asyncHandler(async (req, res) => {
  const category = db.prepare(`
    SELECT id, name, slug, icon, description, parent_id, sort_order
    FROM categories
    WHERE slug = ?
  `).get(req.params.slug);

  if (!category) {
    return res.status(404).json({ error: 'Categoría no encontrada' });
  }

  category.subcategories = db.prepare(`
    SELECT id, name, slug, icon, description, sort_order
    FROM categories
    WHERE parent_id = ?
    ORDER BY sort_order, name
  `).all(category.id);

  res.json({ category });
}));

export default router;