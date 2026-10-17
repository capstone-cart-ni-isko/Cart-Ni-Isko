/**
 * A horizontal progress stepper for multi-step forms.
 * Use this for signup, checkout, and enrollment flows.
 */
export default function ProgressSteps({ steps, currentStep }) {
  return (
    <div className="flex items-center gap-2 mb-6" role="progressbar" aria-valuenow={currentStep + 1} aria-valuemin={1} aria-valuemax={steps.length}>
      {steps.map((label, idx) => {
        const isComplete = idx < currentStep
        const isCurrent = idx === currentStep
        return (
          <div key={label} className="flex items-center gap-2 flex-1">
            <div className="flex items-center gap-2">
              <span className={`w-7 h-7 rounded-full flex items-center justify-center text-xs font-semibold transition-all ${
                isComplete
                  ? 'bg-emerald-500 text-white'
                  : isCurrent
                  ? 'bg-brand-orange text-white'
                  : 'bg-gray-100 dark:bg-[var(--surface-3)] text-gray-400 dark:text-[var(--muted-2)]'
              }`}>
                {isComplete ? '✓' : idx + 1}
              </span>
              <span className={`text-xs font-semibold hidden sm:block ${isCurrent ? 'text-gray-900 dark:text-[var(--ink)]' : 'text-gray-400 dark:text-[var(--muted-2)]'}`}>
                {label}
              </span>
            </div>
            {idx < steps.length - 1 && (
              <div className={`flex-1 h-0.5 rounded ${isComplete ? 'bg-emerald-500' : 'bg-gray-200 dark:bg-[var(--line)]'}`} />
            )}
          </div>
        )
      })}
    </div>
  )
}
