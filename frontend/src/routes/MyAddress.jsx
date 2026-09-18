import { useState } from 'react'
import { useAuth } from '../hooks/useAuth.js'
import { useToast } from '../hooks/useToast.js'
import AppShell from '../components/layout/AppShell.jsx'
import PageHeader from '../components/ui/PageHeader.jsx'
import Input from '../components/ui/Input.jsx'
import Button from '../components/ui/Button.jsx'
import ConfirmModal from '../components/ui/ConfirmModal.jsx'
import { MapPinIcon } from '../components/ui/Icons.jsx'

const EMPTY_FORM = {
  addressLine: '',
  barangay: '',
  city: '',
  province: '',
  postalCode: '',
  isDefault: false,
}

function AddressCard({ address, defaultName, defaultPhone, onEdit, onDelete, onSetDefault }) {
  const recipientName = address.recipient || defaultName
  const phoneNumber = address.phone || defaultPhone

  return (
    <div className={`bg-white rounded-2xl border p-4 shadow-sm ${address.isDefault ? 'border-brand-orange/30' : 'border-gray-200'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-extrabold text-gray-900">{recipientName}</p>
          {address.isDefault && (
            <span className="text-[9px] font-black uppercase tracking-wider px-2 py-0.5 rounded-full bg-brand-orange/10 text-brand-orange border border-brand-orange/20">
              Default
            </span>
          )}
        </div>
        <div className="flex gap-2 shrink-0">
          {!address.isDefault && (
            <button
              type="button"
              onClick={() => onSetDefault(address.id)}
              className="text-[10px] font-bold text-gray-400 hover:text-brand-orange transition-colors cursor-pointer"
            >
              Set Default
            </button>
          )}
          <button type="button" onClick={() => onEdit(address)} className="text-[10px] font-bold text-brand-orange hover:underline cursor-pointer">
            Edit
          </button>
          <button type="button" onClick={() => onDelete(address.id)} className="text-[10px] font-bold text-red-500 hover:underline cursor-pointer">
            Delete
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500">{phoneNumber}</p>
      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
        {address.addressLine}, {address.barangay}, {address.city}, {address.province} {address.postalCode}
      </p>
    </div>
  )
}

function MyAddress() {
  const { currentUser, addresses, addAddress, updateAddress, deleteAddress } = useAuth()
  const { showToast } = useToast()

  const accountName = currentUser?.fullName || 'Juan Dela Cruz'
  const accountPhone = currentUser?.phone || '+63 912 345 6789'

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm((prev) => ({
      ...prev,
      [name]: type === 'checkbox' ? checked : value,
    }))
  }

  const handleAddNew = () => {
    setEditingId(null)
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
      isDefault: Boolean(addr.isDefault),
    })
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const handleSave = (e) => {
    e.preventDefault()
    if (!isFormValid) return

    const addressPayload = {
      ...form,
      recipient: accountName,
      phone: accountPhone,
    }

    if (editingId) {
      updateAddress(editingId, addressPayload)
      showToast('Address updated successfully!')
    } else {
      addAddress({
        ...addressPayload,
        id: Date.now().toString(),
      })
      showToast('Address added successfully!')
    }

    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const handleDelete = (id) => {
    deleteAddress(id)
    showToast('Address removed')
    setDeleteTarget(null)
  }

  const handleSetDefault = (id) => {
    updateAddress(id, { isDefault: true })
    showToast('Default address updated!')
  }

  const isFormValid = form.addressLine?.trim() && form.city?.trim() && form.province?.trim()

  return (
    <AppShell>
      <div className="px-4 py-4 pb-28 lg:px-0 lg:py-0 lg:pb-16 animate-fade-in max-w-3xl mx-auto">
        {/* Desktop Title */}
        <div className="hidden lg:block mb-8">
          <h1 className="text-3xl font-black text-gray-900">My Address</h1>
        </div>

        {/* Mobile Title */}
        <div className="lg:hidden -mx-4 -mt-4 mb-4">
          <PageHeader title="My Address" backTo="/settings" />
        </div>

        <div className="space-y-4">
          {addresses.length === 0 && !showForm && (
            <div className="text-center py-16 flex flex-col items-center justify-center bg-white rounded-2xl border border-gray-200 shadow-sm">
              <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-200 mb-2">
                <MapPinIcon className="w-7 h-7 text-gray-400" />
              </div>
              <p className="text-sm font-bold text-gray-500">No addresses saved yet.</p>
            </div>
          )}

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

          {/* Add / Edit Form */}
          {showForm && (
            <div className="bg-white rounded-2xl border border-gray-200 p-5 shadow-sm space-y-4 animate-fade-in">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-gray-900">
                  {editingId ? 'Edit Address' : 'Add New Address'}
                </h3>
                <span className="text-[10px] font-bold text-gray-400">Recipient info synced from account</span>
              </div>

              {/* Account Contact Display */}
              <div className="bg-orange-50/50 rounded-xl p-3 border border-orange-100/80 flex items-center justify-between text-xs">
                <div>
                  <p className="font-bold text-gray-900">{accountName}</p>
                  <p className="text-gray-500 mt-0.5">{accountPhone}</p>
                </div>
                <span className="text-[10px] font-bold text-brand-orange bg-white px-2.5 py-1 rounded-lg border border-orange-200/80 shadow-2xs">
                  Account Contact
                </span>
              </div>

              <form onSubmit={handleSave} className="space-y-3">
                <Input label="Address Line" name="addressLine" value={form.addressLine} onChange={handleChange} placeholder="House no., Street, Building" />
                <Input label="Barangay" name="barangay" value={form.barangay} onChange={handleChange} placeholder="Barangay" />
                <div className="grid grid-cols-2 gap-3">
                  <Input label="City / Municipality" name="city" value={form.city} onChange={handleChange} placeholder="City" />
                  <Input label="Province" name="province" value={form.province} onChange={handleChange} placeholder="Province" />
                </div>
                <Input label="Postal Code" name="postalCode" value={form.postalCode} onChange={handleChange} placeholder="4500" />

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

                <div className="flex gap-3 pt-2">
                  <Button type="button" variant="secondary" onClick={handleCancel} className="flex-1 h-11 rounded-xl font-bold">
                    Cancel
                  </Button>
                  <Button type="submit" disabled={!isFormValid} className="flex-1 h-11 rounded-xl font-bold shadow-md">
                    Save
                  </Button>
                </div>
              </form>
            </div>
          )}

          {!showForm && (
            <button
              type="button"
              onClick={handleAddNew}
              className="w-full h-12 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-bold text-gray-400 hover:border-brand-orange hover:text-brand-orange hover:bg-white transition-all flex items-center justify-center gap-2 cursor-pointer"
            >
              <span className="text-lg">+</span> Add New Address
            </button>
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
    </AppShell>
  )
}

export default MyAddress
