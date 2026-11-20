/*
  Philippine mobile numbers (SEC-01). Mirrors DatabaseAPI::normalizePhMobile
  and PH_MOBILE_REGEX on the backend: accepts 09XXXXXXXXX, +63 9XX XXX XXXX,
  639XXXXXXXXX or 9XXXXXXXXX and normalises them to 09XXXXXXXXX.
*/
export const PH_MOBILE_MESSAGE = 'Enter a valid Philippine mobile number (09XXXXXXXXX).'

export function normalizePhMobile(value) {
  const digits = String(value || '').replace(/\D/g, '')
  if (digits.length === 12 && digits.startsWith('639')) return `0${digits.slice(2)}`
  if (digits.length === 10 && digits.startsWith('9')) return `0${digits}`
  return digits
}

export function isPhMobile(value) {
  return /^09\d{9}$/.test(normalizePhMobile(value))
}
