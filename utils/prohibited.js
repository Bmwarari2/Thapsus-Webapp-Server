/**
 * Prohibited and restricted items database
 */
const PROHIBITED_ITEMS = {
  dangerous_goods: {
    category: 'Dangerous Goods',
    risk_level: 'critical',
    items: [
      'explosives',
      'flammable liquids',
      'flammable gases',
      'oxidizing substances',
      'toxic substances',
      'radioactive materials',
      'corrosive substances',
      'magnetic materials',
      'fireworks',
      'ammunition',
      'gunpowder',
      'firecrackers',
      'lighters',
      'matches',
      'fuel',
      'pesticides',
      'insecticides'
    ],
    reason: 'Safety hazard during transportation'
  },

  restricted_electronics: {
    category: 'Restricted Electronics',
    risk_level: 'high',
    items: [
      'lithium batteries (quantity restricted)',
      'power banks (large capacity)',
      'hoverboards',
      'e-cigarettes',
      'vaping devices',
      'electronic cigarettes',
      'drone batteries',
      'large battery packs',
      'wireless speakers (specific models)',
      'recording devices in certain countries'
    ],
    reason: 'Battery regulations and customs restrictions'
  },

  liquids_aerosols: {
    category: 'Liquids & Aerosols',
    risk_level: 'high',
    items: [
      'perfume',
      'cologne',
      'nail polish',
      'paint',
      'paint thinner',
      'acetone',
      'alcohol (beverages)',
      'wine',
      'spirits',
      'beer',
      'cleaning supplies',
      'deodorant (aerosol)',
      'hairspray',
      'insect spray',
      'compressed air cans',
      'cooking oil',
      'acid',
      'chemicals',
      'essential oils (large quantities)'
    ],
    reason: 'Transportation safety regulations for liquids'
  },

  weapons: {
    category: 'Weapons',
    risk_level: 'critical',
    items: [
      'firearms',
      'guns',
      'rifles',
      'pistols',
      'handguns',
      'revolvers',
      'ammunition',
      'bullets',
      'cartridges',
      'crossbows',
      'bows and arrows',
      'swords',
      'daggers',
      'knives (large blades)',
      'machetes',
      'axes',
      'pepper spray',
      'tear gas',
      'stun guns',
      'tasers',
      'martial arts weapons'
    ],
    reason: 'Legal restrictions on weapons transportation'
  },

  perishables: {
    category: 'Perishables',
    risk_level: 'medium',
    items: [
      'fresh food',
      'fresh fruits',
      'fresh vegetables',
      'fresh meat',
      'fresh seafood',
      'dairy products',
      'chocolate (warm climates)',
      'ice cream',
      'frozen foods',
      'fresh flowers',
      'fresh plants',
      'live animals',
      'eggs',
      'baked goods'
    ],
    reason: 'Shipping time exceeds shelf life'
  },

  controlled_substances: {
    category: 'Controlled Substances',
    risk_level: 'critical',
    items: [
      'narcotics',
      'cocaine',
      'heroin',
      'methamphetamine',
      'marijuana',
      'cannabis',
      'opium',
      'morphine',
      'prescription medications (without authorization)',
      'controlled drugs'
    ],
    reason: 'Illegal substances - strict customs enforcement'
  },

  counterfeit_items: {
    category: 'Counterfeit/Restricted Goods',
    risk_level: 'high',
    items: [
      'counterfeit products',
      'fake designer goods',
      'pirated software',
      'pirated movies',
      'pirated music',
      'counterfeit currency',
      'fake documents',
      'intellectual property violations'
    ],
    reason: 'Customs regulations and intellectual property laws'
  },

  hazardous_materials: {
    category: 'Hazardous Materials',
    risk_level: 'high',
    items: [
      'asbestos',
      'lead products',
      'mercury',
      'cadmium',
      'chromium',
      'benzene',
      'phthalates',
      'certain paints with lead',
      'old electronics (ewaste)',
      'batteries (improperly packaged)',
      'medical waste'
    ],
    reason: 'Environmental and health hazards'
  },

  valuable_items: {
    category: 'Valuable/Precious Items',
    risk_level: 'medium',
    items: [
      'jewelry (large quantities)',
      'diamonds',
      'precious stones',
      'gold bars',
      'cash',
      'currency',
      'rare coins',
      'art (high value)',
      'antiques (irreplaceable)'
    ],
    reason: 'High value items - insurance limitations'
  },

  human_animal_remains: {
    category: 'Human/Animal Remains',
    risk_level: 'critical',
    items: [
      'human remains',
      'human organs',
      'human blood',
      'human tissue',
      'cremated remains',
      'ashes',
      'preserved animals',
      'endangered species parts',
      'ivory',
      'turtle shells',
      'rhino horns'
    ],
    reason: 'Legal, ethical, and health restrictions'
  }
};

/**
 * Check if an item is prohibited or restricted
 * @param {string} itemName - Name of the item to check
 * @returns {Object} Result with allowed status, reason, and category
 */
export function checkItem(itemName) {
  if (!itemName) {
    return {
      allowed: true,
      reason: 'No item specified',
      category: null
    };
  }

  const normalizedName = itemName.toLowerCase().trim();

  // Search through all categories
  for (const [categoryKey, categoryData] of Object.entries(PROHIBITED_ITEMS)) {
    // Check exact matches and partial matches
    const matchFound = categoryData.items.some(item => {
      const normalizedItem = item.toLowerCase();
      return normalizedName === normalizedItem || normalizedName.includes(normalizedItem) || normalizedItem.includes(normalizedName);
    });

    if (matchFound) {
      return {
        allowed: false,
        reason: categoryData.reason,
        category: categoryData.category,
        risk_level: categoryData.risk_level
      };
    }
  }

  // Item not found in prohibited list
  return {
    allowed: true,
    reason: 'Item is allowed for shipping',
    category: null
  };
}

/**
 * Get all prohibited categories
 * @returns {Array} Array of category objects
 */
export function getProhibitedCategories() {
  return Object.values(PROHIBITED_ITEMS).map(cat => ({
    category: cat.category,
    risk_level: cat.risk_level,
    item_count: cat.items.length,
    reason: cat.reason
  }));
}

/**
 * Get items in a specific category
 * @param {string} category - Category name
 * @returns {Array} Array of items in category
 */
export function getItemsInCategory(category) {
  for (const categoryData of Object.values(PROHIBITED_ITEMS)) {
    if (categoryData.category.toLowerCase() === category.toLowerCase()) {
      return {
        category: categoryData.category,
        risk_level: categoryData.risk_level,
        reason: categoryData.reason,
        items: categoryData.items
      };
    }
  }
  return null;
}

/**
 * Check if item is dangerous (high or critical risk)
 * @param {string} itemName - Item name
 * @returns {boolean}
 */
export function isDangerous(itemName) {
  const result = checkItem(itemName);
  if (!result.allowed) {
    return result.risk_level === 'critical' || result.risk_level === 'high';
  }
  return false;
}

export default {
  checkItem,
  getProhibitedCategories,
  getItemsInCategory,
  isDangerous,
  PROHIBITED_ITEMS
};
