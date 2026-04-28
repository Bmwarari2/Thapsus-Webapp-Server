import express from 'express';
import { v4 as uuidv4 } from 'uuid';
import { checkItem, getProhibitedCategories, getItemsInCategory } from '../utils/prohibited.js';
import { authMiddleware, isAdmin } from '../middleware/auth.js';

const router = express.Router();

/**
 * GET /api/prohibited/check
 * Check if an item is prohibited
 */
router.get('/check', (req, res) => {
  try {
    const { item } = req.query;

    if (!item) {
      return res.status(400).json({
        success: false,
        message: 'Item name is required'
      });
    }

    const result = checkItem(item);

    res.json({
      success: true,
      item: item,
      check: result
    });
  } catch (error) {
    console.error('Check item error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to check item'
    });
  }
});

/**
 * GET /api/prohibited/categories
 * Get all prohibited categories
 */
router.get('/categories', (req, res) => {
  try {
    const categories = getProhibitedCategories();

    res.json({
      success: true,
      categories: categories
    });
  } catch (error) {
    console.error('Get categories error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch categories'
    });
  }
});

/**
 * GET /api/prohibited/categories/:category
 * Get items in a specific category
 */
router.get('/categories/:category', (req, res) => {
  try {
    const { category } = req.params;

    const categoryData = getItemsInCategory(category);

    if (!categoryData) {
      return res.status(404).json({
        success: false,
        message: 'Category not found'
      });
    }

    res.json({
      success: true,
      category: categoryData
    });
  } catch (error) {
    console.error('Get category error:', error);
    res.status(500).json({
      success: false,
      message: 'Failed to fetch category'
    });
  }
});

/**
 * GET /api/prohibited/search?q=...&language=en
 * DB-backed search over the `prohibited_items` table populated by migration 001.
 * Returns rows matching either the term or a substring, scoped by language.
 */
router.get('/search', async (req, res) => {
  try {
    const q = (req.query.q || '').toString().trim();
    const language = (req.query.language || 'en').toString();
    if (!q) return res.json({ success: true, items: [] });
    const { rows } = await req.db.query(
      `SELECT id, term, severity, jurisdiction, language, reason, last_reviewed_at
         FROM prohibited_items
        WHERE language = $1 AND term ILIKE $2
        ORDER BY term ASC LIMIT 50`,
      [language, `%${q}%`]
    );
    res.json({ success: true, items: rows });
  } catch (error) {
    console.error('Search prohibited error:', error);
    res.status(500).json({ success: false, message: 'Search failed' });
  }
});

/** POST /api/prohibited — admin adds a new prohibited entry. */
router.post('/', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { term, severity, jurisdiction, language, reason } = req.body;
    if (!term) return res.status(400).json({ success: false, message: 'term is required' });
    if (!['prohibited','restricted','dangerous_goods'].includes(severity || 'prohibited')) {
      return res.status(400).json({ success: false, message: 'invalid severity' });
    }
    const id = uuidv4();
    await req.db.query(
      `INSERT INTO prohibited_items
         (id, term, severity, jurisdiction, language, reason, last_reviewed_at)
       VALUES ($1,$2,$3,$4,$5,$6,NOW())`,
      [id, term, severity || 'prohibited', jurisdiction || 'KE',
       language || 'en', reason || null]
    );
    res.status(201).json({ success: true, id });
  } catch (error) {
    console.error('Create prohibited error:', error);
    res.status(500).json({ success: false, message: 'Failed to create entry' });
  }
});

/** PATCH /api/prohibited/:id — admin updates an entry. */
router.patch('/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    const { id } = req.params;
    const allowed = ['term','severity','jurisdiction','language','reason'];
    const sets = []; const params = [];
    for (const k of allowed) {
      if (Object.prototype.hasOwnProperty.call(req.body, k)) {
        params.push(req.body[k]);
        sets.push(`${k} = $${params.length}`);
      }
    }
    if (sets.length === 0) {
      return res.status(400).json({ success: false, message: 'No updatable fields' });
    }
    sets.push(`last_reviewed_at = NOW()`);
    params.push(id);
    await req.db.query(
      `UPDATE prohibited_items SET ${sets.join(', ')} WHERE id = $${params.length}`,
      params
    );
    res.json({ success: true });
  } catch (error) {
    console.error('Update prohibited error:', error);
    res.status(500).json({ success: false, message: 'Failed to update entry' });
  }
});

/** DELETE /api/prohibited/:id — admin removes an entry. */
router.delete('/:id', authMiddleware, isAdmin, async (req, res) => {
  try {
    await req.db.query(`DELETE FROM prohibited_items WHERE id = $1`, [req.params.id]);
    res.json({ success: true });
  } catch (error) {
    console.error('Delete prohibited error:', error);
    res.status(500).json({ success: false, message: 'Failed to delete entry' });
  }
});

export default router;
