import { useEffect, useState } from 'react'
import { Link, useLocation } from 'react-router-dom'
import FocusedLayout from '../components/layout/FocusedLayout.jsx'
import { SIZE_CHARTS } from '../data/storePolicies.js'

/*
  BUG-03: the footer's Support links (FAQ & Size Guide, Shipping, Pickups &
  Returns, Contact Support) had no destination. This page holds all four as
  sections; the footer links straight to #faq, #size-guide, #shipping and
  #contact. The copy is a draft for the store to edit.
*/

const SUPPORT_EMAIL = 'support@tindahanniisko.com'

const FAQS = [
  {
    q: 'Who can buy from Tindahan ni Isko?',
    a: 'Anyone. BUeño accounts are for current Bicol University students and faculty; everyone else can shop with a guest account.',
  },
  {
    q: 'How do I pay?',
    a: 'Online orders are paid through PayMongo: GCash, Maya or a debit/credit card. Your order is confirmed once the payment goes through.',
  },
  {
    q: 'How do pre-orders work?',
    a: 'Pre-order items are produced after you order them, so the release date is an estimate. Pre-orders are paid in full at checkout, and we notify you when they are ready.',
  },
  {
    q: 'Where can I see my order status?',
    a: 'Open Orders from your account. Each order shows its current status and the QR code you present at pickup.',
  },
  {
    q: 'I forgot my password. What do I do?',
    a: 'Use "Forgot password" on the sign-in page with the recovery code you saved in Account Settings. If you never saved one, contact the store and we will help you reset it.',
  },
]

const SHIPPING = [
  {
    heading: 'In-store pickup',
    body: 'Choose a pickup slot at checkout and claim your order at the Tindahan ni Isko store during that slot. Bring the order QR code from your Orders page. A missed slot can be rebooked.',
  },
  {
    heading: 'Delivery',
    body: 'Delivery orders are sent by courier to the address you enter at checkout. The delivery fee is quoted live and paid together with your order. You can follow the courier from your Orders page once it is on the way.',
  },
  {
    heading: 'Returns and replacements',
    body: 'Items with manufacturing defects or sizing issues may be replaced within 7 days of receipt. Items must be unused and returned with proof of purchase. Contact the store first so we can arrange the replacement.',
  },
]

function SizeTables() {
  const [unit, setUnit] = useState('inches')
  const keys = Object.keys(SIZE_CHARTS)

  return (
    <div className="space-y-4">
      <div className="flex gap-1 p-0.5 bg-slate-100 dark:bg-[var(--surface-3)] rounded-md w-fit" role="group" aria-label="Measurement unit">
        {['inches', 'cm'].map((u) => (
          <button
            key={u}
            type="button"
            onClick={() => setUnit(u)}
            aria-pressed={unit === u}
            className={`px-3 py-1 rounded-md text-xs font-semibold ${
              unit === u ? 'bg-white dark:bg-[var(--surface)] text-brand-orange border border-slate-200 dark:border-[var(--line)]' : 'text-gray-600 dark:text-[var(--muted)]'
            }`}
          >
            {u === 'inches' ? 'Inches' : 'Centimeters'}
          </button>
        ))}
      </div>
      {keys.map((key) => {
        const chart = SIZE_CHARTS[key]
        const rows = unit === 'inches' ? chart.inches : chart.cm
        return (
          <div key={key} className="overflow-x-auto">
            <p className="text-sm font-semibold text-gray-900 dark:text-[var(--ink)] mb-1.5">{chart.title}</p>
            <table className="w-full min-w-[420px] text-xs border border-slate-200 dark:border-[var(--line)] rounded-lg overflow-hidden">
              <thead className="bg-slate-50 dark:bg-[var(--surface-3)] text-gray-600 dark:text-[var(--muted)]">
                <tr>
                  {['Size', 'Chest', 'Length', 'Shoulder', 'Sleeve'].map((h) => (
                    <th key={h} scope="col" className="px-3 py-2 text-left font-semibold">{h}</th>
                  ))}
                </tr>
              </thead>
              <tbody>
                {rows.map((row) => (
                  <tr key={row.size} className="border-t border-slate-200 dark:border-[var(--line)] text-gray-700 dark:text-[var(--ink)]">
                    <td className="px-3 py-2 font-semibold">{row.size}</td>
                    <td className="px-3 py-2">{row.chest}</td>
                    <td className="px-3 py-2">{row.length}</td>
                    <td className="px-3 py-2">{row.shoulder}</td>
                    <td className="px-3 py-2">{row.sleeve}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>
        )
      })}
    </div>
  )
}

function Card({ id, title, children }) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-slate-200 dark:border-[var(--line)] bg-white dark:bg-[var(--surface)] p-5 sm:p-6 space-y-4"
    >
      <h2 className="text-lg font-semibold text-gray-900 dark:text-[var(--ink)]">{title}</h2>
      {children}
    </section>
  )
}

function HelpCenter() {
  const { hash } = useLocation()

  useEffect(() => {
    if (!hash) return
    const el = document.getElementById(hash.slice(1))
    if (el) el.scrollIntoView({ behavior: 'smooth', block: 'start' })
  }, [hash])

  return (
    <FocusedLayout title="Help & Support" subtitle="FAQ, sizing, shipping, pickups and returns" backTo="/home">
      <div className="animate-fade-in space-y-5 pb-16">
        <nav aria-label="Help sections" className="flex flex-wrap gap-2">
          {[
            ['#faq', 'FAQ'],
            ['#size-guide', 'Size Guide'],
            ['#shipping', 'Shipping, Pickups & Returns'],
            ['#contact', 'Contact Support'],
          ].map(([href, label]) => (
            <Link
              key={href}
              to={`/help${href}`}
              className="text-xs font-semibold px-3 py-1.5 rounded-full border border-slate-200 dark:border-[var(--line)] text-gray-700 dark:text-[var(--ink)] hover:border-brand-orange hover:text-brand-orange"
            >
              {label}
            </Link>
          ))}
        </nav>

        <Card id="faq" title="Frequently asked questions">
          <div className="space-y-2">
            {FAQS.map((item) => (
              <details key={item.q} className="group rounded-xl border border-slate-200 dark:border-[var(--line)] px-4 py-3">
                <summary className="cursor-pointer text-sm font-semibold text-gray-900 dark:text-[var(--ink)]">{item.q}</summary>
                <p className="mt-2 text-sm leading-relaxed text-gray-600 dark:text-[var(--muted)]">{item.a}</p>
              </details>
            ))}
          </div>
        </Card>

        <Card id="size-guide" title="Size guide">
          <p className="text-sm text-gray-600 dark:text-[var(--muted)]">
            Garment measurements, laid flat. If you are between sizes, choose the larger one.
          </p>
          <SizeTables />
        </Card>

        <Card id="shipping" title="Shipping, pickups & returns">
          <div className="space-y-4">
            {SHIPPING.map((item) => (
              <div key={item.heading}>
                <p className="text-sm font-semibold text-gray-900 dark:text-[var(--ink)]">{item.heading}</p>
                <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-[var(--muted)]">{item.body}</p>
              </div>
            ))}
          </div>
        </Card>

        <Card id="contact" title="Contact support">
          <p className="text-sm leading-relaxed text-gray-600 dark:text-[var(--muted)]">
            Questions about an order, a replacement or your account? Email us and include your order number if you have one.
          </p>
          <a href={`mailto:${SUPPORT_EMAIL}`} className="btn btn--primary rounded-xl text-white inline-flex">
            Email {SUPPORT_EMAIL}
          </a>
          <p className="text-xs text-gray-500 dark:text-[var(--muted)]">
            See also our <Link to="/terms" className="text-brand-orange font-semibold hover:underline">Terms &amp; Privacy</Link>.
          </p>
        </Card>
      </div>
    </FocusedLayout>
  )
}

export default HelpCenter
