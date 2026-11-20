import { useRef, useState } from 'react'

/**
 * Tag input for the values of one product option (Color -> Cream, Navy Blue …).
 *
 * Type a value and press Enter or a comma to add it; Backspace on an empty
 * box removes the last one. Values keep their inner spaces ("Navy Blue") and
 * duplicates are ignored regardless of letter case.
 */
export default function OptionValuesInput({
  values = [],
  onChange,
  placeholder = 'Type a value and press Enter',
  ariaLabel = 'Option values',
}) {
  const [draft, setDraft] = useState('')
  const inputRef = useRef(null)

  const commit = (text) => {
    const incoming = String(text || '')
      .split(',')
      .map((value) => value.trim())
      .filter(Boolean)
    if (incoming.length === 0) {
      setDraft('')
      return
    }
    const seen = new Set(values.map((value) => value.toLowerCase()))
    const added = []
    incoming.forEach((value) => {
      if (seen.has(value.toLowerCase())) return
      seen.add(value.toLowerCase())
      added.push(value)
    })
    if (added.length > 0) onChange([...values, ...added])
    setDraft('')
  }

  const remove = (value) => onChange(values.filter((entry) => entry !== value))

  return (
    <div
      className="field-input !h-auto min-h-10 flex flex-wrap items-center gap-1.5 py-1.5 cursor-text focus-within:!border-brand-orange"
      onClick={() => inputRef.current?.focus()}
    >
      {values.map((value) => (
        <span
          key={value}
          className="inline-flex items-center gap-1 h-6 pl-2 pr-1 rounded-md bg-[var(--surface-3)] border border-[var(--line)] text-xs font-semibold text-[var(--ink-2)]"
        >
          {value}
          <button
            type="button"
            onClick={(event) => {
              event.stopPropagation()
              remove(value)
            }}
            aria-label={`Remove ${value}`}
            className="w-4 h-4 inline-flex items-center justify-center rounded text-[var(--muted)] hover:text-rose-600 hover:bg-rose-50 cursor-pointer"
          >
            ×
          </button>
        </span>
      ))}
      <input
        ref={inputRef}
        type="text"
        value={draft}
        aria-label={ariaLabel}
        placeholder={values.length === 0 ? placeholder : 'Add another…'}
        onChange={(event) => {
          const next = event.target.value
          // A typed or pasted comma closes the value(s) before it.
          if (next.includes(',')) {
            const parts = next.split(',')
            const tail = parts.pop()
            commit(parts.join(','))
            setDraft(tail.trimStart())
            return
          }
          setDraft(next)
        }}
        onKeyDown={(event) => {
          if (event.key === 'Enter') {
            event.preventDefault()
            commit(draft)
          } else if (event.key === 'Backspace' && draft === '' && values.length > 0) {
            remove(values[values.length - 1])
          }
        }}
        onBlur={() => commit(draft)}
        // The global :focus-visible outline would draw past the field's edge;
        // the wrapper's border shows focus instead (focus-within above).
        className="flex-1 min-w-[8rem] h-7 bg-transparent outline-none focus:outline-none focus-visible:!outline-none text-sm text-[var(--ink)] placeholder:text-[var(--muted-2)]"
      />
    </div>
  )
}
