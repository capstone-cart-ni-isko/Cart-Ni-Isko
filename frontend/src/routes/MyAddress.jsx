import { lazy, Suspense, useState } from 'react'
import { useNavigate, useSearchParams } from 'react-router-dom'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import FocusedLayout from '../components/layout/FocusedLayout.jsx'
import Input from '../components/ui/Input.jsx'
import Button from '../components/ui/Button.jsx'
import ConfirmModal from '../components/ui/ConfirmModal.jsx'
import { MapPinIcon } from '../components/ui/Icons.jsx'
// Leaflet only loads when the address form is opened.
const MapPinPicker = lazy(() => import('../components/ui/MapPinPicker.jsx'))

const EMPTY_FORM = {
  addressLine: '',
  barangay: '',
  city: '',
  province: '',
  postalCode: '',
  lat: null,
  lng: null,
  isDefault: false,
}

/** Live field checks (shown once a field has been touched). */
function addressErrors(form) {
  const errors = {}
  if (!form.addressLine.trim()) errors.addressLine = 'Enter the house no., street or building.'
  else if (form.addressLine.trim().length < 3) errors.addressLine = 'That address line looks too short.'
  if (!form.city.trim()) errors.city = 'Enter the city or municipality.'
  if (!form.province.trim()) errors.province = 'Enter the province.'
  if (form.postalCode && !/^\d{4}$/.test(form.postalCode.trim())) errors.postalCode = 'Philippine postal codes have 4 digits.'
  return errors
}

function AddressCard({ address, defaultName, defaultPhone, onEdit, onDelete, onSetDefault }) {
  const recipientName = address.recipient || defaultName
  const phoneNumber = address.phone || defaultPhone

  return (
    <div className="flex flex-col gap-3 rounded-2xl border border-gray-100 bg-white p-4 sm:flex-row sm:items-center sm:justify-between sm:gap-4">
      <div className="flex min-w-0 items-start gap-3">
        <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="h-5 w-5">
            <path d="M3 10.5 12 3l9 7.5" strokeLinecap="round" strokeLinejoin="round" />
            <path d="M5.5 9.5V21h13V9.5M9 21v-7h6v7" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
        </div>
        <div className="min-w-0 space-y-0.5">
          <div className="flex flex-wrap items-center gap-2">
            <p className="text-sm font-semibold text-gray-900">{recipientName}</p>
            {address.isDefault && (
              <span className="text-[9px] font-semibold uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-orange/10 text-brand-orange border border-brand-orange/20">
                Default
              </span>
            )}
          </div>
          <p className="text-xs text-gray-500">{phoneNumber}</p>
          <p className="flex items-start gap-1 text-xs text-gray-500 leading-relaxed">
            <MapPinIcon className="mt-0.5 h-3 w-3 shrink-0 text-gray-400" />
            <span>
              {address.addressLine}, {address.barangay}, {address.city}, {address.province} {address.postalCode}
            </span>
          </p>
          {address.lat != null && (
            <p className="flex items-center gap-1 text-[10px] font-semibold text-emerald-600">
              <MapPinIcon className="h-3 w-3" /> Pinned on map
            </p>
          )}
        </div>
      </div>

      <div className="flex shrink-0 flex-wrap items-center gap-3 border-t border-gray-100 pt-2.5 sm:gap-3 sm:border-l sm:border-t-0 sm:pl-4 sm:pt-0">
        {!address.isDefault && (
          <button
            type="button"
            onClick={() => onSetDefault(address.id)}
            className="text-[10px] font-semibold text-gray-400 hover:text-brand-orange transition-colors cursor-pointer"
          >
            Set Default
          </button>
        )}
        <button
          type="button"
          onClick={() => onEdit(address)}
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-blue-600 hover:text-blue-700 transition-colors cursor-pointer"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <path d="m15 5 4 4M4 20l4-.8L19 8a2.1 2.1 0 0 0-3-3L5 16z" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Edit
        </button>
        <button
          type="button"
          onClick={() => onDelete(address.id)}
          className="inline-flex items-center gap-1 text-[10px] font-semibold text-red-500 hover:text-red-600 transition-colors cursor-pointer"
        >
          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="h-3.5 w-3.5">
            <path d="M4 7h16M10 11v6M14 11v6M5 7l1 14h12l1-14M9 7V4h6v3" strokeLinecap="round" strokeLinejoin="round" />
          </svg>
          Delete
        </button>
      </div>
    </div>
  )
}

function MyAddress() {
  const { currentUser, addresses, addressesLoaded, addAddress, updateAddress, deleteAddress } = useAuth()
  const { showToast } = useToast()
  const navigate = useNavigate()
  // Checkout sends the customer here with ?return=/checkout when delivery
  // has no address yet; only same-site paths are followed back.
  const [searchParams] = useSearchParams()
  const rawReturn = searchParams.get('return') || ''
  const returnTo = rawReturn.startsWith('/') && !rawReturn.startsWith('//') ? rawReturn : ''

  const accountName = currentUser?.fullName || 'Juan Dela Cruz'
  const accountPhone = currentUser?.phone || '+63 912 345 6789'

  // Checkout's "Add delivery address" (?add=1) opens the form straight away.
  const [showForm, setShowForm] = useState(() => Boolean(returnTo) && searchParams.get('add') === '1')
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState(null)
  const [saving, setSaving] = useState(false)
  const [touched, setTouched] = useState({})
  const errors = addressErrors(form)
  const fieldError = (name) => (touched[name] ? errors[name] : undefined)

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setTouched((prev) => ({ ...prev, [name]: true }))
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  /* Fields read from the map pin. The place (barangay, city, province,
     postal code) follows the pin; a typed street line is kept, because the
     map rarely knows the house number. */
  const handleMapAddress = (found) => {
    setForm((prev) => ({
      ...prev,
      addressLine: prev.addressLine.trim() ? prev.addressLine : found.addressLine || prev.addressLine,
      barangay: found.barangay || prev.barangay,
      city: found.city || prev.city,
      province: found.province || prev.province,
      postalCode: found.postalCode || prev.postalCode,
    }))
    setTouched((prev) => ({ ...prev, addressLine: true, city: true, province: true, postalCode: true }))
  }

  const handleAddNew = () => {
    setEditingId(null)
    setTouched({})
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const handleEdit = (addr) => {
    setEditingId(addr.id)
    setForm({
      addressLine: addr.addressLine || '',
      barangay: addr.barangay || '',
      city: addr.city || '',
      province: addr.province || '',
      postalCode: addr.postalCode || '',
      lat: addr.lat ?? null,
      lng: addr.lng ?? null,
      isDefault: Boolean(addr.isDefault),
    })
    setTouched({})
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const handleSave = async (e) => {
    e.preventDefault()
    setTouched({ addressLine: true, city: true, province: true, postalCode: true })
    if (!isFormValid) {
      showToast('Fill in the highlighted fields to save this address.', 'error')
      return
    }

    const addressPayload = {
      ...form,
      recipient: accountName,
      phone: accountPhone,
    }

    setSaving(true)
    try {
      if (editingId) {
        await updateAddress(editingId, addressPayload)
        showToast('Address updated successfully!')
      } else {
        await addAddress({
          ...addressPayload,
          id: Date.now().toString(),
        })
        showToast('Address added successfully!')
      }
      setShowForm(false)
      setEditingId(null)
      setForm(EMPTY_FORM)
      if (returnTo) navigate(returnTo)
    } catch (err) {
      showToast(err?.message ? `Unable to save that address: ${err.message}` : 'Unable to save that address.', 'error')
    } finally {
      setSaving(false)
    }
  }

  const handleDelete = async (id) => {
    try {
      await deleteAddress(id)
      showToast('Address removed')
    } catch {
      showToast('Unable to remove that address.', 'error')
    }
    setDeleteTarget(null)
  }

  const handleSetDefault = async (id) => {
    try {
      await updateAddress(id, { isDefault: true })
      showToast('Default address updated!')
    } catch {
      showToast('Unable to set the default address.', 'error')
    }
  }

  const isFormValid = Object.keys(errors).length === 0

  return (
    <FocusedLayout
      title="My Addresses"
      subtitle="Manage your delivery and campus shipping destinations"
      backTo={returnTo || '/settings'}
      containerClassName="max-w-4xl"
    >
      <div className="pb-16 animate-fade-in w-full">
        <div className="space-y-4">
          {!showForm && (
            <section className="overflow-hidden rounded-3xl border border-gray-100/90 bg-white shadow-xs">
              <div className="flex items-center gap-3 border-b border-gray-100 px-5 py-5 sm:px-7">
                <div className="flex h-11 w-11 shrink-0 items-center justify-center rounded-xl bg-blue-50 text-blue-600">
                  <MapPinIcon className="h-5 w-5" />
                </div>
                <div>
                  <h2 className="text-base font-semibold text-gray-900">Saved Addresses</h2>
                  <p className="mt-0.5 text-xs text-gray-500">You can edit or delete your saved addresses anytime.</p>
                </div>
              </div>

              <div className="space-y-4 px-5 py-5 sm:px-7 sm:py-6">
                {addresses.length > 0 ? (
                  <div className="space-y-3">
                    {addresses.map((addr) => (
                      <AddressCard
                        key={addr.id}
                        address={addr}
                        defaultName={accountName}
                        defaultPhone={accountPhone}
                        onEdit={handleEdit}
                        onDelete={(id) => setDeleteTarget(id)}
                        onSetDefault={handleSetDefault}
                      />
                    ))}
                  </div>
                ) : (
                  <div className="flex items-center gap-3 rounded-2xl border border-gray-100 bg-gray-50/60 px-4 py-4">
                    <div className="flex h-9 w-9 shrink-0 items-center justify-center rounded-full bg-white text-gray-400">
                      <MapPinIcon className="h-4 w-4" />
                    </div>
                    <p className="text-xs font-medium text-gray-500">
                      {addressesLoaded ? 'No addresses saved yet.' : 'Loading your saved addresses…'}
                    </p>
                  </div>
                )}

                <button
                  type="button"
                  onClick={handleAddNew}
                  className="flex min-h-12 w-full items-center justify-center gap-2 rounded-xl border border-dashed border-brand-orange/40 bg-brand-orange/5 px-3 py-2.5 text-center text-sm font-semibold text-brand-orange transition-colors hover:bg-brand-orange/10 cursor-pointer"
                >
                  <span className="text-lg leading-none">+</span>
                  <span>Add New Address</span>
                </button>
              </div>
            </section>
          )}

          {/* Add / Edit Form */}
          {showForm && (
            <div className="overflow-hidden rounded-3xl border border-gray-100/90 bg-white shadow-xs animate-fade-in">
              <div className="border-b border-gray-100 px-5 py-5 sm:px-7">
                <h3 className="text-sm font-semibold text-gray-900">
                  {editingId ? 'Edit Address' : 'Add New Address'}
                </h3>
              </div>

              <div className="space-y-5 px-5 py-5 sm:px-7 sm:py-6">
                {/* Account Contact Display */}
                <div className="bg-orange-50/50 rounded-xl p-3 border border-orange-100/80 flex items-center justify-between text-xs">
                  <div>
                    <p className="font-semibold text-gray-900">{accountName}</p>
                    <p className="text-gray-500 mt-0.5">{accountPhone}</p>
                  </div>
                  <span className="text-[10px] font-semibold text-brand-orange bg-white px-2.5 py-1 rounded-lg border border-orange-200/80 shadow-2xs">
                    Account Contact
                  </span>
                </div>

                <form onSubmit={handleSave} className="space-y-4">
                  <Input label="Address Line" name="addressLine" value={form.addressLine} onChange={handleChange} placeholder="House no., Street, Building" error={fieldError('addressLine')} />
                  <Input label="Barangay" name="barangay" value={form.barangay} onChange={handleChange} placeholder="Barangay" />
                  <div className="grid grid-cols-1 gap-4 sm:grid-cols-2">
                    <Input label="City / Municipality" name="city" value={form.city} onChange={handleChange} placeholder="City" error={fieldError('city')} />
                    <Input label="Province" name="province" value={form.province} onChange={handleChange} placeholder="Province" error={fieldError('province')} />
                  </div>
                  <Input label="Postal Code" name="postalCode" value={form.postalCode} onChange={handleChange} placeholder="4500" inputMode="numeric" error={fieldError('postalCode')} />

                  <Suspense fallback={<div className="h-56 rounded-xl border border-gray-200 bg-gray-50 animate-pulse" />}>
                    <MapPinPicker
                      value={form.lat != null && form.lng != null ? { lat: form.lat, lng: form.lng } : null}
                      onChange={(spot) => setForm((prev) => ({ ...prev, lat: spot?.lat ?? null, lng: spot?.lng ?? null }))}
                      query={[form.addressLine, form.barangay, form.city, form.province].filter((p) => p && p.trim()).join(', ')}
                      onAddress={handleMapAddress}
                    />
                  </Suspense>

                  <label className="flex items-center gap-2.5 text-sm text-gray-600 font-semibold select-none cursor-pointer pt-1">
                    <input
                      type="checkbox"
                      name="isDefault"
                      checked={form.isDefault}
                      onChange={handleChange}
                      className="h-4 w-4 accent-brand-orange rounded cursor-pointer"
                    />
                    Set as default address
                  </label>

                  <div className="flex flex-col-reverse gap-3 border-t border-gray-100 pt-5 sm:flex-row sm:justify-end">
                    <Button type="button" variant="secondary" onClick={handleCancel} className="h-11 rounded-xl px-5 font-semibold sm:min-w-32">
                      Cancel
                    </Button>
                    <Button type="submit" disabled={saving} loading={saving} className="h-11 rounded-xl px-6 font-semibold shadow-sm sm:min-w-40">
                      Save Changes
                    </Button>
                  </div>
                </form>
              </div>
            </div>
          )}

        </div>
      </div>

      <ConfirmModal
        isOpen={!!deleteTarget}
        onClose={() => setDeleteTarget(null)}
        onConfirm={() => handleDelete(deleteTarget)}
        title="Delete Address?"
        message="This address will be permanently removed from your account."
        confirmText="Delete"
        isDestructive={true}
      />
    </FocusedLayout>
  )
}

export default MyAddress
