/**
 * Multi-language translations for SwiftCargo
 * Supports English and Swahili
 */

export const translations = {
  en: {
    // Auth
    'auth.register': 'Register',
    'auth.login': 'Login',
    'auth.logout': 'Logout',
    'auth.register_success': 'Registration successful',
    'auth.login_success': 'Login successful',
    'auth.password_changed': 'Password changed successfully',
    'auth.invalid_credentials': 'Invalid email or password',
    'auth.email_exists': 'Email already registered',
    'auth.missing_fields': 'Missing required fields',

    // Orders
    'orders.create': 'Create Order',
    'orders.tracking': 'Track Order',
    'orders.my_orders': 'My Orders',
    'orders.order_created': 'Order created successfully',
    'orders.no_orders': 'No orders found',
    'orders.status_pending': 'Pending',
    'orders.status_warehouse': 'Received at Warehouse',
    'orders.status_consolidating': 'Consolidating',
    'orders.status_transit': 'In Transit',
    'orders.status_customs': 'Customs Clearance',
    'orders.status_delivery': 'Out for Delivery',
    'orders.status_delivered': 'Delivered',

    // Wallet
    'wallet.balance': 'Wallet Balance',
    'wallet.deposit': 'Deposit Funds',
    'wallet.transactions': 'Transactions',
    'wallet.insufficient': 'Insufficient wallet balance',
    'wallet.deposit_success': 'Deposit initiated',
    'wallet.payment_success': 'Payment completed from wallet',

    // Referral
    'referral.code': 'Referral Code',
    'referral.share': 'Share Referral Code',
    'referral.earn': 'Earn 50 KES for each referral',
    'referral.referred': 'You were referred by {name}',
    'referral.history': 'Referral History',
    'referral.total_earned': 'Total Earned',
    'referral.pending': 'Pending',
    'referral.completed': 'Completed',

    // Shipping
    'shipping.economy': 'Economy',
    'shipping.express': 'Express',
    'shipping.from_uk': 'From UK',
    'shipping.from_usa': 'From USA',
    'shipping.from_china': 'From China',
    'shipping.estimated_cost': 'Estimated Cost',
    'shipping.actual_cost': 'Actual Cost',
    'shipping.insurance': 'Insurance',
    'shipping.customs_duty': 'Customs Duty',

    // Tracking
    'tracking.number': 'Tracking Number',
    'tracking.warehouse': 'Warehouse Address',
    'tracking.location': '31 Collingwood Close, Hazel Grove, Stockport, SK7 4LB',
    'tracking.status': 'Status',
    'tracking.date': 'Date',
    'tracking.not_found': 'Tracking number not found',

    // Tickets
    'tickets.support': 'Support Tickets',
    'tickets.create': 'Create Ticket',
    'tickets.subject': 'Subject',
    'tickets.description': 'Description',
    'tickets.priority': 'Priority',
    'tickets.status_open': 'Open',
    'tickets.status_progress': 'In Progress',
    'tickets.status_resolved': 'Resolved',
    'tickets.status_closed': 'Closed',
    'tickets.low': 'Low',
    'tickets.medium': 'Medium',
    'tickets.high': 'High',
    'tickets.created': 'Ticket created successfully',

    // Consolidation
    'consolidation.request': 'Request Consolidation',
    'consolidation.waiting': 'Packages Waiting',
    'consolidation.select': 'Select packages to consolidate',
    'consolidation.minimum': 'At least 2 packages required',
    'consolidation.success': 'Consolidation requested',

    // Pricing
    'pricing.calculate': 'Calculate Price',
    'pricing.weight': 'Weight (kg)',
    'pricing.dimensions': 'Dimensions (L x W x H)',
    'pricing.base_rate': 'Base Rate',
    'pricing.handling': 'Handling Fee',
    'pricing.total': 'Total',
    'pricing.breakdown': 'Cost Breakdown',

    // Admin
    'admin.users': 'Users',
    'admin.all_orders': 'All Orders',
    'admin.statistics': 'Statistics',
    'admin.revenue': 'Revenue',
    'admin.logs': 'Admin Logs',
    'admin.total_users': 'Total Users',
    'admin.total_orders': 'Total Orders',
    'admin.delivered': 'Delivered',
    'admin.pending': 'Pending',

    // General
    'general.success': 'Success',
    'general.error': 'Error',
    'general.loading': 'Loading...',
    'general.delete': 'Delete',
    'general.edit': 'Edit',
    'general.save': 'Save',
    'general.cancel': 'Cancel',
    'general.submit': 'Submit',
    'general.back': 'Back',
    'general.next': 'Next',
    'general.previous': 'Previous',
    'general.search': 'Search',
    'general.filter': 'Filter',
    'general.export': 'Export',
    'general.download': 'Download',
    'general.upload': 'Upload',
    'general.language': 'Language',
    'general.currency': 'Currency',
    'general.date': 'Date',
    'general.time': 'Time',
    'general.today': 'Today',
    'general.yesterday': 'Yesterday',
    'general.this_week': 'This Week',
    'general.this_month': 'This Month',

    // Payment
    'payment.methods': 'Payment Methods',
    'payment.mpesa': 'M-Pesa',
    'payment.stripe': 'Credit/Debit Card',
    'payment.paypal': 'PayPal',
    'payment.wallet': 'Wallet',
    'payment.amount': 'Amount',
    'payment.currency': 'Currency',
    'payment.complete': 'Complete Payment',
    'payment.pending': 'Pending',
    'payment.completed': 'Completed',
    'payment.failed': 'Failed',

    // Messages
    'messages.welcome': 'Welcome to SwiftCargo',
    'messages.goodbye': 'Thank you for using SwiftCargo',
    'messages.loading': 'Please wait...',
    'messages.try_again': 'Please try again',
    'messages.contact_support': 'Contact Support',
    'messages.no_data': 'No data available'
  },

  sw: {
    // Auth
    'auth.register': 'Jisajili',
    'auth.login': 'Ingia',
    'auth.logout': 'Toka',
    'auth.register_success': 'Ujisajili umefanikiwa',
    'auth.login_success': 'Kuingia kumefanikiwa',
    'auth.password_changed': 'Neno la siri limebadilishwa',
    'auth.invalid_credentials': 'Barua pepe au neno la siri sio sahihi',
    'auth.email_exists': 'Barua pepe tayari imejisajili',
    'auth.missing_fields': 'Sehemu zinazohitajika hazijaletwa',

    // Orders
    'orders.create': 'Tengeneza Agizo',
    'orders.tracking': 'Fuatilia Agizo',
    'orders.my_orders': 'Maagizo Yangu',
    'orders.order_created': 'Agizo limetengenezwa',
    'orders.no_orders': 'Hakuna maagizo',
    'orders.status_pending': 'Inasubiri',
    'orders.status_warehouse': 'Ilichukuwa Ghala',
    'orders.status_consolidating': 'Inachanganya',
    'orders.status_transit': 'Njiani',
    'orders.status_customs': 'Ushuru wa Forodha',
    'orders.status_delivery': 'Njiani kwa Kupeleka',
    'orders.status_delivered': 'Imesokezwa',

    // Wallet
    'wallet.balance': 'Salio la Pochi',
    'wallet.deposit': 'Weka Pesa',
    'wallet.transactions': 'Miamala',
    'wallet.insufficient': 'Salio sio sahihi',
    'wallet.deposit_success': 'Kumweka pesa kuanza',
    'wallet.payment_success': 'Malipo yalihesabika kutoka pochi',

    // Referral
    'referral.code': 'Nambari ya Rejea',
    'referral.share': 'Shiriki Nambari ya Rejea',
    'referral.earn': 'Pata 50 KES kwa kila rejea',
    'referral.referred': 'Ulijarejeliwa na {name}',
    'referral.history': 'Historia ya Rejea',
    'referral.total_earned': 'Jumla ya Kupata',
    'referral.pending': 'Inasubiri',
    'referral.completed': 'Imekamilika',

    // Shipping
    'shipping.economy': 'Uchumi',
    'shipping.express': 'Haraka',
    'shipping.from_uk': 'Kutoka UK',
    'shipping.from_usa': 'Kutoka USA',
    'shipping.from_china': 'Kutoka China',
    'shipping.estimated_cost': 'Bei Inayokadiriwa',
    'shipping.actual_cost': 'Bei Halisi',
    'shipping.insurance': 'Bima',
    'shipping.customs_duty': 'Ushuru wa Forodha',

    // Tracking
    'tracking.number': 'Nambari ya Kufuatilia',
    'tracking.warehouse': 'Anwani ya Ghala',
    'tracking.location': '31 Collingwood Close, Hazel Grove, Stockport, SK7 4LB',
    'tracking.status': 'Hali',
    'tracking.date': 'Tarehe',
    'tracking.not_found': 'Nambari ya kufuatilia haipatikani',

    // Tickets
    'tickets.support': 'Tiketi za Msaada',
    'tickets.create': 'Tengeneza Tiketi',
    'tickets.subject': 'Somo',
    'tickets.description': 'Maelezo',
    'tickets.priority': 'Umuhimu',
    'tickets.status_open': 'Wazi',
    'tickets.status_progress': 'Inaendelea',
    'tickets.status_resolved': 'Kutatuliwa',
    'tickets.status_closed': 'Funikwa',
    'tickets.low': 'Chini',
    'tickets.medium': 'Katikati',
    'tickets.high': 'Juu',
    'tickets.created': 'Tiketi imetengenezwa',

    // Consolidation
    'consolidation.request': 'Omba Kuchanganya',
    'consolidation.waiting': 'Pakiti Zinazosibiri',
    'consolidation.select': 'Chagua pakiti kuchanganya',
    'consolidation.minimum': 'Pakiti angalau 2 zinakuhitajika',
    'consolidation.success': 'Ombi la kuchanganya limepokelewa',

    // Pricing
    'pricing.calculate': 'Mahesabu ya Bei',
    'pricing.weight': 'Uzito (kg)',
    'pricing.dimensions': 'Vipimo (L x W x H)',
    'pricing.base_rate': 'Kiwango cha Msingi',
    'pricing.handling': 'Ada ya Kushughulikia',
    'pricing.total': 'Jumla',
    'pricing.breakdown': 'Mwonekano wa Bei',

    // Admin
    'admin.users': 'Watumiaji',
    'admin.all_orders': 'Maagizo Yote',
    'admin.statistics': 'Takwimu',
    'admin.revenue': 'Mapato',
    'admin.logs': 'Kumbukumbu za Msimamizi',
    'admin.total_users': 'Jumla ya Watumiaji',
    'admin.total_orders': 'Jumla ya Maagizo',
    'admin.delivered': 'Ilinipelekwa',
    'admin.pending': 'Inasubiri',

    // General
    'general.success': 'Mafaniko',
    'general.error': 'Kosa',
    'general.loading': 'Inapakia...',
    'general.delete': 'Futa',
    'general.edit': 'Hariri',
    'general.save': 'Hifadhi',
    'general.cancel': 'Ghairi',
    'general.submit': 'Wasilisha',
    'general.back': 'Nyuma',
    'general.next': 'Inayofuata',
    'general.previous': 'Iliyotangulia',
    'general.search': 'Tafuta',
    'general.filter': 'Kuchuja',
    'general.export': 'Hamisha',
    'general.download': 'Pakua',
    'general.upload': 'Pakia',
    'general.language': 'Lugha',
    'general.currency': 'Sarafu',
    'general.date': 'Tarehe',
    'general.time': 'Wakati',
    'general.today': 'Leo',
    'general.yesterday': 'Jana',
    'general.this_week': 'Juma Hili',
    'general.this_month': 'Mwezi Huu',

    // Payment
    'payment.methods': 'Njia za Malipo',
    'payment.mpesa': 'M-Pesa',
    'payment.stripe': 'Kadi ya Mikopo/Debit',
    'payment.paypal': 'PayPal',
    'payment.wallet': 'Pochi',
    'payment.amount': 'Kiasi',
    'payment.currency': 'Sarafu',
    'payment.complete': 'Tumalizia Malipo',
    'payment.pending': 'Inasubiri',
    'payment.completed': 'Imekamilika',
    'payment.failed': 'Kushindwa',

    // Messages
    'messages.welcome': 'Karibu kwenye SwiftCargo',
    'messages.goodbye': 'Asante kwa kutumia SwiftCargo',
    'messages.loading': 'Tafadhali subiri...',
    'messages.try_again': 'Tafadhali jaribu tena',
    'messages.contact_support': 'Wasiliana na Msaada',
    'messages.no_data': 'Hakuna data inayopatikana'
  }
};

/**
 * Get translated string
 * @param {string} key - Translation key
 * @param {string} language - Language code (en or sw)
 * @param {Object} variables - Variables to replace in template
 * @returns {string} Translated string
 */
export function t(key, language = 'en', variables = {}) {
  let text = translations[language]?.[key] || translations['en']?.[key] || key;

  // Replace variables
  Object.entries(variables).forEach(([varKey, varValue]) => {
    text = text.replace(new RegExp(`{${varKey}}`, 'g'), varValue);
  });

  return text;
}

/**
 * Get all translations for a language
 * @param {string} language - Language code
 * @returns {Object} All translations
 */
export function getLanguage(language = 'en') {
  return translations[language] || translations['en'];
}

/**
 * Batch translate multiple keys
 * @param {Array} keys - Array of translation keys
 * @param {string} language - Language code
 * @returns {Object} Object with translations
 */
export function batchTranslate(keys, language = 'en') {
  const result = {};
  keys.forEach(key => {
    result[key] = t(key, language);
  });
  return result;
}

export default {
  translations,
  t,
  getLanguage,
  batchTranslate
};
