import express from 'express';
import { checkItem, getProhibitedCategories, getItemsInCategory } from '../utils/prohibited.js';

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

export default router;
