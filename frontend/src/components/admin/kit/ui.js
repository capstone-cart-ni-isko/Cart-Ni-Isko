/* Shared control styles for the dashboard and its drawers (one button/input system). */
export const BTN_PRIMARY =
  'inline-flex items-center justify-center gap-2 h-9 px-3.5 rounded-md bg-isko-orange hover:bg-isko-orange-dark text-white text-sm font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-isko-orange focus-visible:ring-offset-1'

export const BTN_SECONDARY =
  'inline-flex items-center justify-center gap-2 h-9 px-3.5 rounded-md bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-sm font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-isko-orange'

export const INPUT =
  'w-full h-9 px-2.5 rounded-md border border-slate-200 bg-white text-sm text-slate-900 placeholder:text-slate-400 focus:outline-none focus:border-isko-blue focus:ring-2 focus:ring-isko-blue/20'

export const LABEL = 'block text-xs font-medium text-slate-600 mb-1'

// Square icon-only button (refresh, camera, etc.)
export const ICON_BTN =
  'h-8 w-8 rounded-md border border-slate-200 bg-white text-slate-500 hover:text-isko-blue hover:border-isko-blue/40 hover:bg-isko-blue/5 flex items-center justify-center cursor-pointer transition-colors shrink-0 focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-isko-orange'

// Small variants for in-row actions (tables, lists)
export const BTN_PRIMARY_SM =
  'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md bg-isko-orange hover:bg-isko-orange-dark text-white text-xs font-semibold transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-isko-orange focus-visible:ring-offset-1'

export const BTN_SECONDARY_SM =
  'inline-flex items-center justify-center gap-1.5 h-8 px-3 rounded-md bg-white hover:bg-slate-50 border border-slate-200 text-slate-700 text-xs font-medium transition-colors cursor-pointer disabled:opacity-50 disabled:cursor-not-allowed focus-visible:outline-none focus-visible:ring-2 focus-visible:ring-isko-orange'

// Select styled like INPUT but compact, for filter bars
export const SELECT_SM =
  'h-8 pl-2.5 pr-7 rounded-md border border-slate-200 bg-white text-xs font-medium text-slate-700 focus:outline-none focus:border-isko-blue focus:ring-2 focus:ring-isko-blue/20 cursor-pointer'

// Bottom fade for lists that scroll inside a panel (signals "more below")
export const SCROLL_FADE =
  'overflow-auto pb-4 [mask-image:linear-gradient(to_bottom,black_calc(100%-20px),transparent)]'

// The page shell root and its flexible body (see Panel.jsx)
export const PAGE_ROOT = 'flex flex-col gap-3 lg:h-full lg:min-h-0'

export const peso = (n) => `₱${Number(n || 0).toLocaleString('en-US', { minimumFractionDigits: 2, maximumFractionDigits: 2 })}`
