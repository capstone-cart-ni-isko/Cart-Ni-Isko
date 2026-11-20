import FocusedLayout from '../components/layout/FocusedLayout.jsx'
import { TERMS, PRIVACY } from '../data/storePolicies.js'

/*
  BUG-03: the footer's "Terms & Privacy" link had no page. Same copy as the
  sign-up Terms modal (data/storePolicies.js), readable without an account.
*/

function PolicySection({ id, title, items }) {
  return (
    <section
      id={id}
      className="scroll-mt-24 rounded-2xl border border-slate-200 dark:border-[var(--line)] bg-white dark:bg-[var(--surface)] p-5 sm:p-6 space-y-4"
    >
      <h2 className="text-lg font-semibold text-gray-900 dark:text-[var(--ink)]">{title}</h2>
      {items.map((item) => (
        <div key={item.heading}>
          <p className="text-sm font-semibold text-gray-900 dark:text-[var(--ink)]">{item.heading}</p>
          <p className="mt-1 text-sm leading-relaxed text-gray-600 dark:text-[var(--muted)]">{item.body}</p>
        </div>
      ))}
    </section>
  )
}

function TermsPrivacy() {
  return (
    <FocusedLayout title="Terms & Privacy" subtitle="Terms of Use and Privacy Policy" backTo="/home">
      <div className="animate-fade-in space-y-5 pb-16">
        <PolicySection id="terms" title="Terms of Use" items={TERMS} />
        <PolicySection id="privacy" title="Privacy Policy" items={PRIVACY} />
      </div>
    </FocusedLayout>
  )
}

export default TermsPrivacy
