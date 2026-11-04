/**
 * One password standard for every account - customer, staff, admin and super
 * admin - mirroring EmployeePassword::meetsStandard on the backend:
 * at least 8 characters with an uppercase letter, a lowercase letter, a
 * number and a symbol.
 */
export const PASSWORD_MIN_LENGTH = 8

export const PASSWORD_HINT =
  'At least 8 characters with an uppercase letter, a lowercase letter, a number and a symbol.'

/** The first unmet rule as a message, or '' when the password is acceptable. */
export function passwordProblem(value) {
  const pwd = String(value ?? '')
  if (pwd.length < PASSWORD_MIN_LENGTH) return `Use at least ${PASSWORD_MIN_LENGTH} characters.`
  if (/\s/.test(pwd)) return 'Passwords cannot contain spaces.'
  if (!/[A-Z]/.test(pwd)) return 'Add at least one uppercase letter.'
  if (!/[a-z]/.test(pwd)) return 'Add at least one lowercase letter.'
  if (!/[0-9]/.test(pwd)) return 'Add at least one number.'
  if (!/[^A-Za-z0-9]/.test(pwd)) return 'Add at least one symbol (e.g. ! @ # $).'
  return ''
}

export const meetsPasswordStandard = (value) => passwordProblem(value) === ''
