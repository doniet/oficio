import { Router } from 'express';
import { q, qOne } from '../db/acceso.js';
import { asyncHandler } from '../middleware/errorHandler.js';

const router = Router();

router.get('/', asyncHandler(async (req, res) => {
  const categories = await q<any>(`
    SELECT id, name, slug, icon, description, parent_id, sort_order
    FROM categories
    WHERE parent_id IS NULL
    ORDER BY sort_order, name
  `);

  const children = await q<any>(`
    SELECT id, name, slug, icon, description, parent_id, sort_order
    FROM categories WHERE parent_id IS NOT NULL ORDER BY sort_order, name
  `);
  for (const cat of categories) {
    cat.subcategories = children.filter((c: any) => c.parent_id === cat.id);
  }

  res.set('Cache-Control', 'public, max-age=300');
  res.json({ categories });
}));

router.get('/flat', asyncHandler(async (req, res) => {
  const categories = await q(`
    SELECT id, name, slug, icon, description, parent_id, sort_order
    FROM categories
    ORDER BY parent_id NULLS FIRST, sort_order, name
  `);

  res.json({ categories });
}));

router.get('/:id', asyncHandler(async (req, res) => {
  const category = await qOne<any>(`
    SELECT id, name, slug, icon, description, parent_id, sort_order
    FROM categories
    WHERE id = $1
  `, [req.params.id]);

  if (!category) {
    return res.status(404).json({ error: 'Categoría no encontrada' });
  }

  category.subcategories = await q(`
    SELECT id, name, slug, icon, description, sort_order
    FROM categories
    WHERE parent_id = $1
    ORDER BY sort_order, name
  `, [category.id]);

  res.json({ category });
}));

router.get('/slug/:slug', asyncHandler(async (req, res) => {
  const category = await qOne<any>(`
    SELECT id, name, slug, icon, description, parent_id, sort_order
    FROM categories
    WHERE slug = $1
  `, [req.params.slug]);

  if (!category) {
    return res.status(404).json({ error: 'Categoría no encontrada' });
  }

  category.subcategories = await q(`
    SELECT id, name, slug, icon, description, sort_order
    FROM categories
    WHERE parent_id = $1
    ORDER BY sort_order, name
  `, [category.id]);

  res.json({ category });
}));

export default router;
