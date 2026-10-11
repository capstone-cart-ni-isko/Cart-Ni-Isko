import { useEffect, useState } from 'react'
import { onApiChange } from '../services/realtime.js'

/**
 * Re-render trigger for realtime changes.
 *
 * Returns a counter that increments (debounced) whenever a ping for one of
 * `resources` arrives. Drop the counter into the dependency list of the effect
 * that loads the screen's data and the screen re-fetches the moment another
 * device writes, without a bespoke subscription at each call site:
 *
 *     const version = useApiChange(['orders', 'checkout'])
 *     useEffect(() => { load() }, [load, version])
 *
 * `resources` is a name, an array of names, or '*'.
 */
export function useApiChange(resources, options) {
  const [version, setVersion] = useState(0)
  // Stringify so an inline array literal does not re-subscribe on every render.
  const key = JSON.stringify(resources)
  const debounce = options?.debounce

  useEffect(() => {
    return onApiChange(JSON.parse(key), () => setVersion((v) => v + 1), { debounce })
  }, [key, debounce])

  return version
}
