import { useState } from 'react'
import Modal from './Modal.jsx'
import Button from './Button.jsx'
import { HelpIcon } from './Icons.jsx'
import { normalizeProductCategory } from '../../data/productCategories.js'

const SIZE_CHARTS = {
  Hoodies: {
    title: 'BU Hoodies & Sweatshirts',
    note: 'Unisex relaxed fit. Measurements are taken with the garment laid flat.',
    sizes: ['S', 'M', 'L', 'XL', '2XL'],
    inches: [
      { size: 'S', chest: '20"', length: '27"', shoulder: '19"', sleeve: '24"' },
      { size: 'M', chest: '22"', length: '28"', shoulder: '20.5"', sleeve: '25"' },
      { size: 'L', chest: '24"', length: '29"', shoulder: '22"', sleeve: '26"' },
      { size: 'XL', chest: '26"', length: '30"', shoulder: '23.5"', sleeve: '27"' },
      { size: '2XL', chest: '28"', length: '31"', shoulder: '25"', sleeve: '28"' },
    ],
    cm: [
      { size: 'S', chest: '51 cm', length: '68 cm', shoulder: '48 cm', sleeve: '61 cm' },
      { size: 'M', chest: '56 cm', length: '71 cm', shoulder: '52 cm', sleeve: '63 cm' },
      { size: 'L', chest: '61 cm', length: '74 cm', shoulder: '56 cm', sleeve: '66 cm' },
      { size: 'XL', chest: '66 cm', length: '76 cm', shoulder: '60 cm', sleeve: '68 cm' },
      { size: '2XL', chest: '71 cm', length: '79 cm', shoulder: '64 cm', sleeve: '71 cm' },
    ],
  },
  Jackets: {
    title: 'BU Varsity Jackets',
    note: 'Boxy collegiate varsity cut with room for layering over inner shirts or hoodies.',
    sizes: ['S', 'M', 'L', 'XL', '2XL'],
    inches: [
      { size: 'S', chest: '21.5"', length: '26.5"', shoulder: '19.5"', sleeve: '24.5"' },
      { size: 'M', chest: '23.5"', length: '27.5"', shoulder: '21"', sleeve: '25.5"' },
      { size: 'L', chest: '25.5"', length: '28.5"', shoulder: '22.5"', sleeve: '26.5"' },
      { size: 'XL', chest: '27.5"', length: '29.5"', shoulder: '24"', sleeve: '27.5"' },
      { size: '2XL', chest: '29.5"', length: '30.5"', shoulder: '25.5"', sleeve: '28.5"' },
    ],
    cm: [
      { size: 'S', chest: '55 cm', length: '67 cm', shoulder: '49 cm', sleeve: '62 cm' },
      { size: 'M', chest: '60 cm', length: '70 cm', shoulder: '53 cm', sleeve: '65 cm' },
      { size: 'L', chest: '65 cm', length: '72 cm', shoulder: '57 cm', sleeve: '67 cm' },
      { size: 'XL', chest: '70 cm', length: '75 cm', shoulder: '61 cm', sleeve: '70 cm' },
      { size: '2XL', chest: '75 cm', length: '77 cm', shoulder: '65 cm', sleeve: '72 cm' },
    ],
  },
  Shirts: {
    title: 'BU T-Shirts & Polos',
    note: 'Standard tropical cotton fit. True to size; order one size up for oversized style.',
    sizes: ['S', 'M', 'L', 'XL', '2XL'],
    inches: [
      { size: 'S', chest: '19"', length: '26"', shoulder: '17.5"', sleeve: '8"' },
      { size: 'M', chest: '20.5"', length: '27.5"', shoulder: '18.5"', sleeve: '8.5"' },
      { size: 'L', chest: '22"', length: '29"', shoulder: '20"', sleeve: '9"' },
      { size: 'XL', chest: '23.5"', length: '30.5"', shoulder: '21.5"', sleeve: '9.5"' },
      { size: '2XL', chest: '25"', length: '31.5"', shoulder: '23"', sleeve: '10"' },
    ],
    cm: [
      { size: 'S', chest: '48 cm', length: '66 cm', shoulder: '44 cm', sleeve: '20 cm' },
      { size: 'M', chest: '52 cm', length: '70 cm', shoulder: '47 cm', sleeve: '22 cm' },
      { size: 'L', chest: '56 cm', length: '74 cm', shoulder: '51 cm', sleeve: '23 cm' },
      { size: 'XL', chest: '60 cm', length: '77 cm', shoulder: '55 cm', sleeve: '24 cm' },
      { size: '2XL', chest: '64 cm', length: '80 cm', shoulder: '58 cm', sleeve: '25 cm' },
    ],
  },
}

export default function SizeGuideModal({ isOpen, onClose, category = 'Hoodies' }) {
  const [unit, setUnit] = useState('inches') // 'inches' | 'cm'
  const normalizedCategory = normalizeProductCategory(category)
  const defaultTab = SIZE_CHARTS[normalizedCategory] ? normalizedCategory : 'Hoodies'
  const [activeTab, setActiveTab] = useState(defaultTab)

  if (!isOpen) return null

  const currentChart = SIZE_CHARTS[activeTab] || SIZE_CHARTS.Hoodies
  const rows = unit === 'inches' ? currentChart.inches : currentChart.cm

  return (
    <Modal
      isOpen={isOpen}
      onClose={onClose}
      title="Official Size Guide"
      subtitle="Garment measurements & fit guidance"
      size="wide"
      footer={
        <>
          <span className="field-hint mr-auto">Exchanges allowed within 7 days of campus claim</span>
          <Button variant="primary" onClick={onClose}>
            Got It
          </Button>
        </>
      }
    >
      {/* Category Tabs & Unit Switcher */}
      <div className="flex flex-wrap items-center justify-between gap-2.5 pb-3 border-b border-slate-200">
        <div className="flex gap-1 p-0.5 bg-slate-100 rounded-md">
          {Object.keys(SIZE_CHARTS).map((tabKey) => (
            <button
              key={tabKey}
              type="button"
              onClick={() => setActiveTab(tabKey)}
              className={`px-2.5 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
                activeTab === tabKey
                  ? 'bg-white text-gray-900 border border-slate-200'
                  : 'text-gray-600 hover:text-gray-800'
              }`}
            >
              {tabKey}
            </button>
          ))}
        </div>

        <div className="flex items-center gap-1 p-0.5 bg-slate-100 rounded-md">
          <button
            type="button"
            onClick={() => setUnit('inches')}
            className={`px-2 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              unit === 'inches' ? 'bg-white text-brand-orange border border-slate-200' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Inches (in)
          </button>
          <button
            type="button"
            onClick={() => setUnit('cm')}
            className={`px-2 py-1 rounded-md text-xs font-semibold transition-all cursor-pointer ${
              unit === 'cm' ? 'bg-white text-brand-orange border border-slate-200' : 'text-gray-600 hover:text-gray-800'
            }`}
          >
            Centimeters (cm)
          </button>
        </div>
      </div>

      {/* Content Body */}
      <div className="modal-scroll space-y-4">
        <div>
          <div className="flex items-center justify-between mb-1">
            <h3 className="text-xs font-bold text-gray-800">{currentChart.title}</h3>
            <span className="text-[10px] font-semibold text-brand-orange bg-orange-50 border border-orange-200 px-2 py-0.5 rounded-md">
              Standard BU Unisex Sizing
            </span>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">{currentChart.note}</p>
        </div>

        {/* Sizing Table */}
        <div className="border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-gray-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2 px-2.5 font-bold text-gray-700">Size</th>
                <th className="py-2 px-2.5">Chest (Width)</th>
                <th className="py-2 px-2.5">Body Length</th>
                <th className="py-2 px-2.5">Shoulder</th>
                <th className="py-2 px-2.5">Sleeve</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-gray-700">
              {rows.map((r, idx) => (
                <tr key={r.size} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                  <td className="py-1.5 px-2.5 font-bold text-brand-orange">{r.size}</td>
                  <td className="py-1.5 px-2.5">{r.chest}</td>
                  <td className="py-1.5 px-2.5">{r.length}</td>
                  <td className="py-1.5 px-2.5">{r.shoulder}</td>
                  <td className="py-1.5 px-2.5">{r.sleeve}</td>
                </tr>
              ))}
            </tbody>
          </table>
        </div>

        {/* How to Measure Section */}
        <div className="bg-orange-50/40 border border-orange-200 rounded-md p-3.5">
          <h4 className="text-xs font-bold text-orange-950 uppercase tracking-wider mb-2 flex items-center gap-1.5">
            <HelpIcon className="w-3.5 h-3.5 text-brand-orange shrink-0" />
            <span>How to Find Your Best Fit</span>
          </h4>
          <ul className="text-xs text-orange-950/80 space-y-1 list-disc list-inside leading-relaxed">
            <li>
              <strong className="text-orange-900">Chest Width:</strong> Measure flat across the fullest part of the garment 1 inch below armholes.
            </li>
            <li>
              <strong className="text-orange-900">Body Length:</strong> Measure from highest point of the shoulder seam straight down to bottom hem.
            </li>
            <li>
              <strong className="text-orange-900">Sleeve:</strong> Measure from the top shoulder seam down to cuff edge.
            </li>
            <li>
              <strong className="text-orange-900">Streetwear Tip:</strong> If you are between sizes or prefer an oversized drape, order one size up.
            </li>
          </ul>
        </div>
      </div>
    </Modal>
  )
}
