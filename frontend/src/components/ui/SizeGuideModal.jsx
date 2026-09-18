import { useState } from 'react'

const SIZE_CHARTS = {
  Hoodie: {
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
  'Varsity Jacket': {
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

export default function SizeGuideModal({ isOpen, onClose, category = 'Hoodie' }) {
  const [unit, setUnit] = useState('inches') // 'inches' | 'cm'
  const defaultTab = SIZE_CHARTS[category] ? category : 'Hoodie'
  const [activeTab, setActiveTab] = useState(defaultTab)

  if (!isOpen) return null

  const currentChart = SIZE_CHARTS[activeTab] || SIZE_CHARTS.Hoodie
  const rows = unit === 'inches' ? currentChart.inches : currentChart.cm

  return (
    <div className="fixed inset-0 z-50 flex items-center justify-center p-4 bg-black/60 backdrop-blur-xs animate-fade-in">
      <div
        className="bg-white w-full max-w-xl rounded-3xl shadow-2xl overflow-hidden flex flex-col max-h-[90vh] animate-scale-in"
        onClick={(e) => e.stopPropagation()}
      >
        {/* Header */}
        <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100 bg-gray-50/50">
          <div className="flex items-center gap-2.5">
            <div className="w-8 h-8 rounded-xl bg-orange-100 text-brand-orange flex items-center justify-center font-bold text-sm">
              📏
            </div>
            <div>
              <h2 className="text-lg font-black text-gray-900">Official Size Guide</h2>
              <p className="text-xs text-gray-400">Garment measurements & fit guidance</p>
            </div>
          </div>
          <button
            type="button"
            onClick={onClose}
            className="w-8 h-8 rounded-full bg-white border border-gray-200 text-gray-500 hover:text-gray-800 hover:bg-gray-100 flex items-center justify-center transition-colors cursor-pointer"
          >
            ✕
          </button>
        </div>

        {/* Category Tabs & Unit Switcher */}
        <div className="px-6 pt-4 pb-2 flex flex-wrap items-center justify-between gap-3 border-b border-gray-100">
          <div className="flex gap-1.5 p-1 bg-gray-100 rounded-xl">
            {Object.keys(SIZE_CHARTS).map((tabKey) => (
              <button
                key={tabKey}
                type="button"
                onClick={() => setActiveTab(tabKey)}
                className={`px-3 py-1.5 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                  activeTab === tabKey
                    ? 'bg-white text-gray-900 shadow-xs'
                    : 'text-gray-500 hover:text-gray-800'
                }`}
              >
                {tabKey}
              </button>
            ))}
          </div>

          <div className="flex items-center gap-1 p-1 bg-gray-100 rounded-xl">
            <button
              type="button"
              onClick={() => setUnit('inches')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                unit === 'inches' ? 'bg-white text-brand-orange shadow-xs' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Inches (in)
            </button>
            <button
              type="button"
              onClick={() => setUnit('cm')}
              className={`px-2.5 py-1 rounded-lg text-xs font-bold transition-all cursor-pointer ${
                unit === 'cm' ? 'bg-white text-brand-orange shadow-xs' : 'text-gray-500 hover:text-gray-800'
              }`}
            >
              Centimeters (cm)
            </button>
          </div>
        </div>

        {/* Content Body */}
        <div className="px-6 py-4 overflow-y-auto space-y-5">
          <div>
            <div className="flex items-center justify-between mb-2">
              <h3 className="text-sm font-extrabold text-gray-800">{currentChart.title}</h3>
              <span className="text-[11px] font-medium text-brand-orange bg-orange-50 px-2 py-0.5 rounded-md">
                Standard BU Unisex Sizing
              </span>
            </div>
            <p className="text-xs text-gray-500 leading-relaxed">{currentChart.note}</p>
          </div>

          {/* Sizing Table */}
          <div className="border border-gray-200 rounded-2xl overflow-hidden shadow-2xs">
            <table className="w-full text-left text-xs">
              <thead className="bg-gray-50 text-gray-500 font-bold border-b border-gray-200">
                <tr>
                  <th className="py-2.5 px-3 font-extrabold text-gray-700">Size</th>
                  <th className="py-2.5 px-3">Chest (Width)</th>
                  <th className="py-2.5 px-3">Body Length</th>
                  <th className="py-2.5 px-3">Shoulder</th>
                  <th className="py-2.5 px-3">Sleeve</th>
                </tr>
              </thead>
              <tbody className="divide-y divide-gray-100 text-gray-700">
                {rows.map((r, idx) => (
                  <tr key={r.size} className={idx % 2 === 0 ? 'bg-white' : 'bg-gray-50/50'}>
                    <td className="py-2.5 px-3 font-black text-brand-orange">{r.size}</td>
                    <td className="py-2.5 px-3">{r.chest}</td>
                    <td className="py-2.5 px-3">{r.length}</td>
                    <td className="py-2.5 px-3">{r.shoulder}</td>
                    <td className="py-2.5 px-3">{r.sleeve}</td>
                  </tr>
                ))}
              </tbody>
            </table>
          </div>

          {/* How to Measure Section */}
          <div className="bg-orange-50/60 border border-orange-100 rounded-2xl p-4">
            <h4 className="text-xs font-extrabold text-orange-900 uppercase tracking-wider mb-2 flex items-center gap-1.5">
              <span>💡</span> How to Find Your Best Fit
            </h4>
            <ul className="text-xs text-orange-950/80 space-y-1.5 list-disc list-inside leading-relaxed">
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

        {/* Footer */}
        <div className="px-6 py-3.5 border-t border-gray-100 bg-gray-50 flex items-center justify-between">
          <span className="text-[11px] text-gray-400">Exchanges allowed within 7 days of campus claim</span>
          <button
            type="button"
            onClick={onClose}
            className="px-5 py-2 rounded-xl bg-brand-orange text-white text-xs font-bold hover:bg-brand-orange-dark transition-colors cursor-pointer"
          >
            Got It
          </button>
        </div>
      </div>
    </div>
  )
}
