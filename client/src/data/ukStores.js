/**
 * Curated catalog of popular UK online stores for the Buy-for-me flow.
 *
 * Customers should request the UK version of a retailer (e.g. amazon.co.uk)
 * so we can buy + ship from the UK. This list powers the clickable marquee on
 * the Buy-for-me page and the searchable /uk-stores directory.
 *
 * Each entry: { name, url, category, color } — `color` is the brand accent
 * used for the avatar chip.
 */
export const UK_STORE_CATEGORIES = [
  'Marketplace',
  'Fashion',
  'Electronics',
  'Home & DIY',
  'Beauty & Health',
  'Sports & Outdoors',
  'Kids & Toys',
  'Supermarket',
  'Luxury',
]

export const UK_STORES = [
  // Marketplaces
  { name: 'Amazon UK', url: 'https://www.amazon.co.uk', category: 'Marketplace', color: '#ff9900' },
  { name: 'eBay UK', url: 'https://www.ebay.co.uk', category: 'Marketplace', color: '#e53238' },
  { name: 'Etsy UK', url: 'https://www.etsy.com/uk', category: 'Marketplace', color: '#f1641e' },
  { name: 'OnBuy', url: 'https://www.onbuy.com', category: 'Marketplace', color: '#3b5998' },

  // Fashion
  { name: 'ASOS', url: 'https://www.asos.com', category: 'Fashion', color: '#2d2d2d' },
  { name: 'Next', url: 'https://www.next.co.uk', category: 'Fashion', color: '#1a1a1a' },
  { name: 'Marks & Spencer', url: 'https://www.marksandspencer.com', category: 'Fashion', color: '#0a7d34' },
  { name: 'Zara UK', url: 'https://www.zara.com/uk', category: 'Fashion', color: '#000000' },
  { name: 'H&M UK', url: 'https://www2.hm.com/en_gb', category: 'Fashion', color: '#e50010' },
  { name: 'Primark', url: 'https://www.primark.com/en-gb', category: 'Fashion', color: '#0091cd' },
  { name: 'Boohoo', url: 'https://www.boohoo.com', category: 'Fashion', color: '#f6007e' },
  { name: 'PrettyLittleThing', url: 'https://www.prettylittlething.com', category: 'Fashion', color: '#f4c2c2' },
  { name: 'River Island', url: 'https://www.riverisland.com', category: 'Fashion', color: '#1a1a1a' },
  { name: 'TK Maxx', url: 'https://www.tkmaxx.com/uk', category: 'Fashion', color: '#e2001a' },
  { name: 'JD Sports', url: 'https://www.jdsports.co.uk', category: 'Fashion', color: '#000000' },

  // Electronics
  { name: 'Currys', url: 'https://www.currys.co.uk', category: 'Electronics', color: '#742d82' },
  { name: 'Argos', url: 'https://www.argos.co.uk', category: 'Electronics', color: '#ed1b24' },
  { name: 'AO', url: 'https://ao.com', category: 'Electronics', color: '#00b3e3' },
  { name: 'Apple UK', url: 'https://www.apple.com/uk', category: 'Electronics', color: '#555555' },
  { name: 'Samsung UK', url: 'https://www.samsung.com/uk', category: 'Electronics', color: '#1428a0' },
  { name: 'Scan', url: 'https://www.scan.co.uk', category: 'Electronics', color: '#e30613' },
  { name: 'Box', url: 'https://www.box.co.uk', category: 'Electronics', color: '#ee2e24' },

  // Home & DIY
  { name: 'IKEA UK', url: 'https://www.ikea.com/gb/en', category: 'Home & DIY', color: '#0058a3' },
  { name: 'B&Q', url: 'https://www.diy.com', category: 'Home & DIY', color: '#ff6600' },
  { name: 'Screwfix', url: 'https://www.screwfix.com', category: 'Home & DIY', color: '#003478' },
  { name: 'Wickes', url: 'https://www.wickes.co.uk', category: 'Home & DIY', color: '#004b8d' },
  { name: 'Dunelm', url: 'https://www.dunelm.com', category: 'Home & DIY', color: '#e64415' },
  { name: 'John Lewis', url: 'https://www.johnlewis.com', category: 'Home & DIY', color: '#000000' },
  { name: 'The Range', url: 'https://www.therange.co.uk', category: 'Home & DIY', color: '#e30613' },

  // Beauty & Health
  { name: 'Boots', url: 'https://www.boots.com', category: 'Beauty & Health', color: '#05054b' },
  { name: 'Superdrug', url: 'https://www.superdrug.com', category: 'Beauty & Health', color: '#e6007e' },
  { name: 'LookFantastic', url: 'https://www.lookfantastic.com', category: 'Beauty & Health', color: '#1a1a1a' },
  { name: 'The Body Shop', url: 'https://www.thebodyshop.com/en-gb', category: 'Beauty & Health', color: '#00573f' },
  { name: 'Holland & Barrett', url: 'https://www.hollandandbarrett.com', category: 'Beauty & Health', color: '#1f7a3d' },

  // Sports & Outdoors
  { name: 'Sports Direct', url: 'https://www.sportsdirect.com', category: 'Sports & Outdoors', color: '#ee1c2e' },
  { name: 'Nike UK', url: 'https://www.nike.com/gb', category: 'Sports & Outdoors', color: '#111111' },
  { name: 'adidas UK', url: 'https://www.adidas.co.uk', category: 'Sports & Outdoors', color: '#000000' },
  { name: 'Decathlon UK', url: 'https://www.decathlon.co.uk', category: 'Sports & Outdoors', color: '#0082c3' },
  { name: 'GO Outdoors', url: 'https://www.gooutdoors.co.uk', category: 'Sports & Outdoors', color: '#0a6b3b' },

  // Kids & Toys
  { name: 'Smyths Toys', url: 'https://www.smythstoys.com/uk', category: 'Kids & Toys', color: '#ed1c24' },
  { name: 'The Entertainer', url: 'https://www.thetoyshop.com', category: 'Kids & Toys', color: '#e4002b' },
  { name: 'LEGO UK', url: 'https://www.lego.com/en-gb', category: 'Kids & Toys', color: '#d01012' },
  { name: 'JoJo Maman Bébé', url: 'https://www.jojomamanbebe.co.uk', category: 'Kids & Toys', color: '#5b9bd5' },

  // Supermarkets
  { name: 'Tesco', url: 'https://www.tesco.com', category: 'Supermarket', color: '#00539f' },
  { name: 'Sainsbury’s', url: 'https://www.sainsburys.co.uk', category: 'Supermarket', color: '#f06c00' },
  { name: 'ASDA', url: 'https://www.asda.com', category: 'Supermarket', color: '#68a51c' },
  { name: 'Ocado', url: 'https://www.ocado.com', category: 'Supermarket', color: '#6a1b9a' },

  // Luxury
  { name: 'Selfridges', url: 'https://www.selfridges.com', category: 'Luxury', color: '#ffe600' },
  { name: 'Harrods', url: 'https://www.harrods.com', category: 'Luxury', color: '#9b7d2e' },
  { name: 'Harvey Nichols', url: 'https://www.harveynichols.com', category: 'Luxury', color: '#1a1a1a' },
  { name: 'END.', url: 'https://www.endclothing.com', category: 'Luxury', color: '#111111' },
]

export const storeInitials = (name = '') =>
  name.replace(/[^A-Za-z0-9 ]/g, '').trim().split(/\s+/).slice(0, 2)
    .map((w) => w[0]?.toUpperCase() || '').join('') || '?'
