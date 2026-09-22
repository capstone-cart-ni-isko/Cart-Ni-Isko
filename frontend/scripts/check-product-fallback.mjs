// Regression check for the catalog fallback matcher.
//
// Verifies the real module (src/services/productFallback.js) against the real
// products.json: DB rows must find their photos by prod_tag, then by name
// overlap, and must never borrow another product's images.
//
// Run with: npm test   (plain Node, no test framework needed)

import { findFallback, nameTokens, toTitleCase, EMPTY_VARIANT } from '../src/services/productFallback.js'
import { readFileSync } from 'node:fs'

const catalogue = JSON.parse(readFileSync(new URL('../src/data/products.json', import.meta.url), 'utf8'))

const rows = [
  { prod_id: 1, prod_tag: 'prod-1', prod_name: 'BU Labels 2025 Hoodie', prod_categ: 'Hoodie' },
  { prod_id: 2, prod_tag: 'prod-2', prod_name: 'Bicol University Hoodie', prod_categ: 'Hoodie' },
  { prod_id: 3, prod_tag: 'prod-3', prod_name: 'BUnique Ringer Tee', prod_categ: 'Shirts' },
  { prod_id: 4, prod_tag: 'prod-4', prod_name: 'BU Varsity Jacket', prod_categ: 'Varsity Jacket' },
  { prod_id: 5, prod_tag: 'prod-5', prod_name: 'BUnique BU Labels Cap', prod_categ: 'Cap' },
  { prod_id: 6, prod_tag: 'prod-6', prod_name: 'BUnique Lanyard & Badge', prod_categ: 'Accessories' },
  { prod_id: 7, prod_tag: 'prod-7', prod_name: 'Insulated Water Bottle', prod_categ: 'Accessories' },
  { prod_id: 8, prod_tag: 'prod-8', prod_name: 'University Pin Badge', prod_categ: 'Accessories' },
  { prod_id: 9, prod_tag: 'prod-9', prod_name: 'BU Polo Shirt', prod_categ: 'Shirts' },
  // Seeded rows that have no products.json twin - matched by name overlap
  { prod_id: 10, prod_tag: 'ITEM_36174', prod_name: 'BU Lanyard 477', prod_categ: 'ACCESSORIES' },
  { prod_id: 11, prod_tag: 'ITEM_79101', prod_name: 'BU Lanyard 312', prod_categ: 'ACCESSORIES' },
  { prod_id: 12, prod_tag: 'ITEM_87331', prod_name: 'BU Lanyard 833', prod_categ: 'ACCESSORIES' },
  { prod_id: 13, prod_tag: 'ITEM_71810', prod_name: 'BU Lanyard 302', prod_categ: 'ACCESSORIES' },
]

let failures = 0
const check = (label, cond, detail = '') => {
  console.log(`[${cond ? 'PASS' : 'FAIL'}] ${label}${detail ? ' :: ' + detail : ''}`)
  if (!cond) failures += 1
}

// 1. Tokeniser returns a Set - calling .has() on an array was a real crash
const tokens = nameTokens('BU Lanyard 477')
check('nameTokens returns a Set with .has()', typeof tokens.has === 'function', tokens.constructor.name)
check('short words are ignored', !tokens.has('bu') && tokens.has('lanyard'))

// 2. Matching behaviour
for (const row of rows) {
  const hit = findFallback(row, catalogue)
  console.log(`  ${row.prod_tag.padEnd(11)} ${row.prod_name.padEnd(26)} -> ${hit ? hit.name : 'PLACEHOLDER'}`)
}

check('tagged rows match their own product',
  rows.filter((r) => r.prod_tag.startsWith('prod-'))
    .every((r) => findFallback(r, catalogue)?.name === r.prod_name))

check('ITEM_* rows match the lanyard product by name',
  rows.filter((r) => r.prod_tag.startsWith('ITEM_'))
    .every((r) => findFallback(r, catalogue)?.name === 'BUnique Lanyard & Badge'))

check('unrecognised product gets a placeholder, not someone else\'s photos',
  findFallback({ prod_id: 99, prod_tag: 'ZZZ_1', prod_name: 'Quantum Flux Capacitor' }, catalogue) === null)

check('bad input never throws', findFallback(null, catalogue) === null && findFallback({}, undefined) === null)
check('placeholder variant carries no images', EMPTY_VARIANT.images.length === 0)

// 3. Category normalisation used by the Shop filters
check('ACCESSORIES -> Accessories', toTitleCase('ACCESSORIES') === 'Accessories')
check('OTHERS -> Others', toTitleCase('OTHERS') === 'Others')
check('already-title-cased values are untouched', toTitleCase('Varsity Jacket') === 'Varsity Jacket')

console.log(`\n${failures === 0 ? 'All checks passed.' : `${failures} check(s) failed.`}`)
process.exit(failures === 0 ? 0 : 1)
