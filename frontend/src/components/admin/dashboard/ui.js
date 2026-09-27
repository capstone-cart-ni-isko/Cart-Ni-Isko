/* Shared control styles for the dashboard and its drawers (one button/input system). */
export const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 h-9 px-3.5 rounded-md bg-isko-orange hover:bg-isko-orange-dark text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-isko-orange focus-visible:ring-offset-1'

export const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 h-9 px-3.5 rounded-md bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-isko-orange'

export const INPUT =
  'w-full h-9 px-2.5 rounded-md border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-isko-blue focus:ring-2 focus:ring-isko-blue/20'

export const LABEL = 'block text-xs font-medium text-slate-600 mb-1'

export const peso = (n) => `₱${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
