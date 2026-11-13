/**
 * One way to read a product variation everywhere (orders, cart, receipts,
 * admin screens).
 *
 * A combination is described by its own axes - {Color: 'Cream', Size: 'Small'}
 * - stored in prodvar_options. Each axis is shown under its real name, so a
 * product that varies by Color x Material never shows a "Size" label, and a
 * value is never repeated under the wrong axis. A variation without axes falls
 * back to its single name under "Variation".
 */

/** Parse a prodvar_options cell (JSON string or object) into a plain map. */
export function parseVariationOptions(raw) {
  if (!raw) return {}
  if (typeof raw === 'object') return Array.isArray(raw) ? {} : raw
  try {
    const parsed = JSON.parse(String(raw))
    return parsed && typeof parsed === 'object' && !Array.isArray(parsed) ? parsed : {}
  } catch {
    return {}
  }
}

/**
 * [{ axis, value }] for a variation. Accepts a prodvar row, an order item
 * (prodvar_options / prodvar_name on the item, or a nested `prodvar`), or a
 * plain { options, name } pair.
 */
export function variationParts(source) {
  if (!source) return []
  const nested = source.prodvar && typeof source.prodvar === 'object' ? source.prodvar : null
  const options = parseVariationOptions(
    source.prodvar_options ?? source.options ?? nested?.prodvar_options ?? null
  )

  const parts = Object.entries(options)
    .map(([axis, value]) => ({ axis: String(axis).trim(), value: String(value ?? '').trim() }))
    .filter((part) => part.axis && part.value)
  if (parts.length > 0) return parts

  // Never fall back to a bare `name`: on an order line that is the product's
  // name, not the variation's.
  const name = String(
    source.prodvar_name ?? source.prodvarName ?? nested?.prodvar_name ?? ''
  ).trim()
  if (!name || /^(standard|main|default)$/i.test(name)) return []
  return [{ axis: 'Variation', value: name }]
}

/** "Color: Cream · Size: Small" (empty string when there is nothing to say). */
export function variationText(source, separator = ' · ') {
  return variationParts(source)
    .map((part) => `${part.axis}: ${part.value}`)
    .join(separator)
}

/** "Cream / Small" - the values alone, the way a combination is named. */
export function variationValues(source, separator = ' / ') {
  return variationParts(source)
    .map((part) => part.value)
    .join(separator)
}
