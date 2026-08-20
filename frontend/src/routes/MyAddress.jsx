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
  recipient: '',
  phone: '',
  addressLine: '',
  barangay: '',
  city: '',
  province: '',
  postalCode: '',
  isDefault: false,
}

function AddressCard({ address, onEdit, onDelete, onSetDefault }) {
  return (
    <div className={`bg-white rounded-2xl border p-4 shadow-sm ${address.isDefault ? 'border-brand-orange/30' : 'border-gray-100'}`}>
      <div className="flex items-start justify-between gap-2 mb-2">
        <div className="flex items-center gap-2">
          <p className="text-sm font-extrabold text-gray-900">{address.recipient}</p>
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
              className="text-[10px] font-bold text-gray-400 hover:text-brand-orange transition-colors"
            >
              Set Default
            </button>
          )}
          <button type="button" onClick={() => onEdit(address)} className="text-[10px] font-bold text-brand-orange hover:underline">
            Edit
          </button>
          <button type="button" onClick={() => onDelete(address.id)} className="text-[10px] font-bold text-red-500 hover:underline">
            Delete
          </button>
        </div>
      </div>
      <p className="text-xs text-gray-500">{address.phone}</p>
      <p className="text-xs text-gray-500 mt-0.5 leading-relaxed">
        {address.addressLine}, {address.barangay}, {address.city}, {address.province} {address.postalCode}
      </p>
    </div>
  )
}

function MyAddress() {
  const { addresses, addAddress, updateAddress, deleteAddress } = useAuth()
  const { showToast } = useToast()

  const [showForm, setShowForm] = useState(false)
  const [editingId, setEditingId] = useState(null)
  const [form, setForm] = useState(EMPTY_FORM)
  const [deleteTarget, setDeleteTarget] = useState(null)

  const handleChange = (e) => {
    const { name, value, type, checked } = e.target
    setForm((prev) => ({ ...prev, [name]: type === 'checkbox' ? checked : value }))
  }

  const handleEdit = (address) => {
    setEditingId(address.id)
    setForm({
      recipient: address.recipient,
      phone: address.phone,
      addressLine: address.addressLine,
      barangay: address.barangay,
      city: address.city,
      province: address.province,
      postalCode: address.postalCode,
      isDefault: address.isDefault,
    })
    setShowForm(true)
  }

  const handleAddNew = () => {
    setEditingId(null)
    setForm(EMPTY_FORM)
    setShowForm(true)
  }

  const handleCancel = () => {
    setShowForm(false)
    setEditingId(null)
    setForm(EMPTY_FORM)
  }

  const handleSave = (e) => {
    e.preventDefault()
    if (editingId) {
      updateAddress(editingId, form)
      showToast('Address updated!')
    } else {
      addAddress(form)
      showToast('Address added!')
    }
    handleCancel()
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

  const isFormValid = form.recipient && form.phone && form.addressLine && form.city && form.province

  return (
    <AppShell showNav={false}>
      <PageHeader title="My Address" backTo="/settings" />

      <div className="px-4 py-4 pb-12 space-y-3 animate-fade-in">
        {addresses.length === 0 && !showForm && (
          <div className="text-center py-16 flex flex-col items-center justify-center">
            <div className="w-16 h-16 bg-gray-50 rounded-full flex items-center justify-center border border-gray-100 mb-2">
              <MapPinIcon className="w-7 h-7 text-gray-400" />
            </div>
            <p className="text-sm font-bold text-gray-500">No addresses saved yet.</p>
          </div>
        )}

        {addresses.map((addr) => (
          <AddressCard
            key={addr.id}
            address={addr}
            onEdit={handleEdit}
            onDelete={(id) => setDeleteTarget(id)}
            onSetDefault={handleSetDefault}
          />
        ))}

        {/* Add / Edit Form */}
        {showForm && (
          <div className="bg-white rounded-2xl border border-gray-100 p-5 shadow-sm space-y-4 animate-fade-in">
            <h3 className="text-sm font-extrabold text-gray-900">
              {editingId ? 'Edit Address' : 'Add New Address'}
            </h3>
            <form onSubmit={handleSave} className="space-y-3">
              <Input label="Recipient Name" name="recipient" value={form.recipient} onChange={handleChange} placeholder="Full name" />
              <Input label="Phone Number" name="phone" type="tel" value={form.phone} onChange={handleChange} placeholder="+63 9XX XXX XXXX" />
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
                  className="h-4 w-4 accent-brand-orange rounded"
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
            className="w-full h-12 border-2 border-dashed border-gray-200 rounded-2xl text-sm font-bold text-gray-400 hover:border-brand-orange hover:text-brand-orange transition-all flex items-center justify-center gap-2"
          >
            <span className="text-lg">+</span> Add New Address
          </button>
        )}
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
