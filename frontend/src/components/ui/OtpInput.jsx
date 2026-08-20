import { useRef } from 'react'

function OtpInput({ length = 6, value, onChange }) {
  const inputsRef = useRef([])

  function handleChange(index, digit) {
    if (!/^\d?$/.test(digit)) return
    const next = value.split('')
    next[index] = digit
    const joined = next.join('').slice(0, length)
    onChange(joined)
    if (digit && index < length - 1) {
      inputsRef.current[index + 1]?.focus()
    }
  }

  function handleKeyDown(index, e) {
    if (e.key === 'Backspace' && !value[index] && index > 0) {
      inputsRef.current[index - 1]?.focus()
    }
  }

  function handlePaste(e) {
    e.preventDefault()
    const pasted = e.clipboardData.getData('text').replace(/\D/g, '').slice(0, length)
    onChange(pasted)
    const focusIndex = Math.min(pasted.length, length - 1)
    inputsRef.current[focusIndex]?.focus()
  }

  return (
    <div className="flex gap-2 justify-center">
      {Array.from({ length }).map((_, i) => (
        <input
          key={i}
          ref={(el) => { inputsRef.current[i] = el }}
          type="text"
          inputMode="numeric"
          maxLength={1}
          value={value[i] || ''}
          onChange={(e) => handleChange(i, e.target.value)}
          onKeyDown={(e) => handleKeyDown(i, e)}
          onPaste={handlePaste}
          className="w-12 h-14 text-center text-xl font-bold border border-gray-300 rounded-xl focus:outline-none focus:ring-2 focus:ring-brand-orange/40 focus:border-brand-orange transition-all"
        />
      ))}
    </div>
  )
}

export default OtpInput
