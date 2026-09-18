import { useState, useEffect } from 'react'
import { Link } from 'react-router-dom'
import { useToast } from '../hooks/useToast.js'
import AppShell from '../components/layout/AppShell.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import Button from '../components/ui/Button.jsx'
import ConfirmModal from '../components/ui/ConfirmModal.jsx'

const DEFAULT_PAYMENT_METHODS = [
  {
    id: 'pm-1',
    type: 'gcash',
    label: 'GCash',
    accountName: 'Juan Dela Cruz',
    accountNumber: '0912 ••• •678',
    isDefault: true,
  },
  {
    id: 'pm-2',
    type: 'maya',
    label: 'Maya',
    accountName: 'Juan Dela Cruz',
    accountNumber: '0912 ••• •678',
    isDefault: false,
  },
]

function PaymentIcon({ type, className = 'w-6 h-6' }) {
  if (type === 'gcash') {
    return (
      <div className="w-10 h-10 rounded-xl bg-blue-500 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-xs">
        G
      </div>
    )
  }
  if (type === 'maya') {
    return (
      <div className="w-10 h-10 rounded-xl bg-emerald-600 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-xs">
        M
      </div>
    )
  }
  return (
    <div className="w-10 h-10 rounded-xl bg-orange-500 text-white flex items-center justify-center font-black text-xs shrink-0 shadow-xs">
      💳
    </div>
  )
}

export default function PaymentMethods() {
  const { showToast } = useToast()
  const [methods, setMethods] = useState(() => {
    const saved = localStorage.getItem('isko_payment_methods')
    return saved ? JSON.parse(saved) : DEFAULT_PAYMENT_METHODS
  })

  const [showAddModal, setShowAddModal] = useState(false)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [form, setForm] = useState({
    type: 'gcash',
    accountName: '',
    accountNumber: '',
  })

  useEffect(() => {
    localStorage.setItem('isko_payment_methods', JSON.stringify(methods))
  }, [methods])

  const handleSetDefault = (id) => {
    setMethods((prev) =>
      prev.map((m) => ({
        ...m,
        isDefault: m.id === id,
      }))
    )
    showToast('Default payment method updated')
  }

  const handleDelete = () => {
    if (!deleteTarget) return
    setMethods((prev) => {
      const filtered = prev.filter((m) => m.id !== deleteTarget.id)
      if (filtered.length > 0 && !filtered.some((m) => m.isDefault)) {
        filtered[0].isDefault = true
      }
      return filtered
    })
    setDeleteTarget(null)
    showToast('Payment method removed')
  }

  const handleAddMethod = (e) => {
    e.preventDefault()
    if (!form.accountName.trim() || !form.accountNumber.trim()) {
      showToast('Please fill out all fields', 'error')
      return
    }

    const labels = {
      gcash: 'GCash',
      maya: 'Maya',
      card: 'Debit / Credit Card',
    }

    const newMethod = {
      id: `pm-${Date.now()}`,
      type: form.type,
      label: labels[form.type] || 'Payment Method',
      accountName: form.accountName.trim(),
      accountNumber: form.accountNumber.trim(),
      isDefault: methods.length === 0,
    }

    setMethods((prev) => [...prev, newMethod])
    setForm({ type: 'gcash', accountName: '', accountNumber: '' })
    setShowAddModal(false)
    showToast('Payment method added successfully')
  }

  return (
    <AppShell>
      <div className="px-4 py-4 pb-28 lg:px-0 lg:py-0 lg:pb-16 animate-fade-in max-w-3xl mx-auto">
        {/* Desktop Title & Breadcrumbs */}
        <div className="hidden lg:block mb-8">
          <div className="flex items-center gap-2 text-xs font-semibold text-gray-400 mb-2">
            <Link to="/settings" className="hover:text-brand-orange transition-colors">
              Settings
            </Link>
            <span>/</span>
            <span className="text-gray-900 font-bold">Payment Methods</span>
          </div>
          <h1 className="text-3xl font-black text-gray-900">Payment Methods</h1>
          <p className="text-sm text-gray-500 mt-1">
            Manage your digital wallets and payment options for seamless campus orders.
          </p>
        </div>

        {/* Mobile Header */}
        <div className="lg:hidden -mx-4 -mt-4 mb-4">
          <PageHeader title="Payment Methods" backTo="/settings" />
        </div>

        {/* Payment Methods List */}
        <div className="space-y-4">
          <div className="flex items-center justify-between">
            <h2 className="text-xs font-black text-gray-400 uppercase tracking-widest px-1">
              Saved Methods
            </h2>
            <button
              type="button"
              onClick={() => setShowAddModal(true)}
              className="text-xs font-bold text-brand-orange hover:underline cursor-pointer flex items-center gap-1"
            >
              <span>+ Add Method</span>
            </button>
          </div>

          <div className="space-y-3">
            {methods.map((method) => (
              <div
                key={method.id}
                className={`bg-white rounded-2xl border p-4 shadow-2xs flex items-center justify-between gap-3 transition-all ${
                  method.isDefault ? 'border-brand-orange/40 ring-1 ring-brand-orange/20' : 'border-gray-200'
                }`}
              >
                <div className="flex items-center gap-3.5 min-w-0">
                  <PaymentIcon type={method.type} />
                  <div className="min-w-0">
                    <div className="flex items-center gap-2">
                      <p className="text-sm font-bold text-gray-900">{method.label}</p>
                      {method.isDefault && (
                        <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-orange/10 text-brand-orange border border-brand-orange/20">
                          Default
                        </span>
                      )}
                    </div>
                    <p className="text-xs text-gray-500 font-medium truncate mt-0.5">
                      {method.accountName} · {method.accountNumber}
                    </p>
                  </div>
                </div>

                <div className="flex items-center gap-2 shrink-0">
                  {!method.isDefault && (
                    <button
                      type="button"
                      onClick={() => handleSetDefault(method.id)}
                      className="text-xs font-bold text-gray-500 hover:text-brand-orange px-2 py-1 rounded-lg hover:bg-gray-50 transition-colors cursor-pointer"
                    >
                      Set Default
                    </button>
                  )}
                  <button
                    type="button"
                    onClick={() => setDeleteTarget(method)}
                    className="text-xs font-bold text-red-500 hover:text-red-700 px-2 py-1 rounded-lg hover:bg-red-50 transition-colors cursor-pointer"
                  >
                    Delete
                  </button>
                </div>
              </div>
            ))}

            {methods.length === 0 && (
              <div className="bg-white rounded-2xl border border-dashed border-gray-200 p-8 text-center">
                <p className="text-sm font-bold text-gray-700">No payment methods added yet</p>
                <p className="text-xs text-gray-400 mt-1">
                  Add your GCash or Maya account for faster checkout.
                </p>
                <Button
                  onClick={() => setShowAddModal(true)}
                  className="mt-4 text-xs font-bold px-4 py-2"
                >
                  Add Payment Method
                </Button>
              </div>
            )}
          </div>

          {/* Campus Cash Info Card */}
          <div className="bg-gradient-to-br from-orange-50/60 to-amber-50/40 rounded-2xl border border-orange-200/70 p-4.5 mt-6 flex items-start gap-3.5">
            <span className="text-xl mt-0.5">ℹ️</span>
            <div className="text-xs text-gray-600 leading-relaxed">
              <strong className="text-gray-900 block mb-0.5 font-bold">
                Cash on Pick-up (COP) Always Available
              </strong>
              You can also pay in cash directly at the BU Student Center pick-up counter when claiming your verified orders.
            </div>
          </div>
        </div>
      </div>

      {/* Add Payment Method Modal */}
      {showAddModal && (
        <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
          <div
            className="bg-white w-full max-w-md rounded-3xl shadow-2xl p-6 animate-scale-in space-y-5"
            onClick={(e) => e.stopPropagation()}
          >
            <div className="flex items-center justify-between border-b border-gray-100 pb-3">
              <h3 className="text-lg font-black text-gray-900">Add Payment Method</h3>
              <button
                type="button"
                onClick={() => setShowAddModal(false)}
                className="w-8 h-8 rounded-full bg-gray-100 text-gray-500 hover:text-gray-800 flex items-center justify-center text-sm cursor-pointer"
              >
                ✕
              </button>
            </div>

            <form onSubmit={handleAddMethod} className="space-y-4">
              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1.5">Method Type</label>
                <div className="grid grid-cols-3 gap-2">
                  {[
                    { id: 'gcash', label: 'GCash' },
                    { id: 'maya', label: 'Maya' },
                    { id: 'card', label: 'Card' },
                  ].map((m) => (
                    <button
                      key={m.id}
                      type="button"
                      onClick={() => setForm((prev) => ({ ...prev, type: m.id }))}
                      className={`py-2 px-3 rounded-xl border text-xs font-bold transition-all cursor-pointer ${
                        form.type === m.id
                          ? 'border-brand-orange bg-orange-50 text-brand-orange ring-1 ring-brand-orange'
                          : 'border-gray-200 bg-white text-gray-700 hover:bg-gray-50'
                      }`}
                    >
                      {m.label}
                    </button>
                  ))}
                </div>
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">Account Name</label>
                <input
                  type="text"
                  placeholder="e.g. Juan Dela Cruz"
                  value={form.accountName}
                  onChange={(e) => setForm((prev) => ({ ...prev, accountName: e.target.value }))}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-1 focus:ring-brand-orange outline-none"
                  required
                />
              </div>

              <div>
                <label className="block text-xs font-bold text-gray-700 mb-1">
                  {form.type === 'card' ? 'Card Number' : 'Mobile / Account Number'}
                </label>
                <input
                  type="text"
                  placeholder={form.type === 'card' ? '•••• •••• •••• ••••' : '0912 ••• ••••'}
                  value={form.accountNumber}
                  onChange={(e) => setForm((prev) => ({ ...prev, accountNumber: e.target.value }))}
                  className="w-full text-xs px-3.5 py-2.5 rounded-xl border border-gray-200 focus:border-brand-orange focus:ring-1 focus:ring-brand-orange outline-none"
                  required
                />
              </div>

              <div className="flex items-center justify-end gap-2 pt-3 border-t border-gray-100">
                <button
                  type="button"
                  onClick={() => setShowAddModal(false)}
                  className="px-4 py-2 rounded-xl text-xs font-bold text-gray-500 hover:bg-gray-100 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="submit"
                  className="px-5 py-2 rounded-xl bg-brand-orange text-white text-xs font-bold hover:bg-brand-orange-dark active:scale-95 transition-all shadow-xs cursor-pointer"
                >
                  Save Method
                </button>
              </div>
            </form>
          </div>
        </div>
      )}

      {/* Delete Confirmation Modal */}
      <ConfirmModal
        isOpen={Boolean(deleteTarget)}
        onClose={() => setDeleteTarget(null)}
        onConfirm={handleDelete}
        title="Remove Payment Method?"
        message={`Are you sure you want to remove ${deleteTarget?.label || 'this payment method'}?`}
        confirmText="Remove"
        isDestructive={true}
      />
    </AppShell>
  )
}
