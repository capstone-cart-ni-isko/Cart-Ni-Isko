export const PRODUCT_CATEGORIES = [
  'Shirts',
  'Hoodies',
  'Jackets',
  'Caps',
  'Lanyards',
  'Stickers',
  'Pins',
  'Totebags',
  'Keychains',
]

export const PRODUCT_CATEGORY_FILTERS = ['All', ...PRODUCT_CATEGORIES]

const CATEGORY_ALIASES = {
  shirt: 'Shirts',
  shirts: 'Shirts',
  hoodie: 'Hoodies',
  hoodies: 'Hoodies',
  jacket: 'Jackets',
  jackets: 'Jackets',
  'varsity jacket': 'Jackets',
  'varsity jackets': 'Jackets',
  windbreaker: 'Jackets',
  windbreakers: 'Jackets',
  cap: 'Caps',
  caps: 'Caps',
  lanyard: 'Lanyards',
  lanyards: 'Lanyards',
  sticker: 'Stickers',
  stickers: 'Stickers',
  pin: 'Pins',
  pins: 'Pins',
  'tote bag': 'Totebags',
  'tote bags': 'Totebags',
  totebag: 'Totebags',
  totebags: 'Totebags',
  'key chain': 'Keychains',
  'key chains': 'Keychains',
  keychain: 'Keychains',
  keychains: 'Keychains',
}

function inferLegacyAccessory(name) {
  const item = String(name || '').toLowerCase()
  if (item.includes('lanyard')) return 'Lanyards'
  if (item.includes('tote')) return 'Totebags'
  if (item.includes('key chain') || item.includes('keychain')) return 'Keychains'
  if (item.includes('sticker')) return 'Stickers'
  if (item.includes('pin') || item.includes('badge')) return 'Pins'
  if (item.includes('cap')) return 'Caps'
  return 'Accessories'
}

export function normalizeProductCategory(raw, productName = '') {
  const key = String(raw || '').trim().toLowerCase().replace(/[_-]+/g, ' ').replace(/\s+/g, ' ')
  if (!key || key === 'accessory' || key === 'accessories') {
    return inferLegacyAccessory(productName)
  }
  return CATEGORY_ALIASES[key] || String(raw || '').trim() || 'Accessories'
}
