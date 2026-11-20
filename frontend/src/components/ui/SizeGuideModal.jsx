import { useState } from 'react'
import Modal from './Modal.jsx'
import Button from './Button.jsx'
import { HelpIcon } from './Icons.jsx'
import { normalizeProductCategory } from '../../data/productCategories.js'
import { SIZE_CHARTS } from '../../data/storePolicies.js'

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
            <h3 className="text-xs font-semibold text-gray-800">{currentChart.title}</h3>
          </div>
          <p className="text-xs text-gray-500 leading-relaxed">{currentChart.note}</p>
        </div>

        {/* Sizing Table */}
        <div className="border border-slate-200 rounded-md overflow-hidden">
          <table className="w-full text-left text-xs">
            <thead className="bg-slate-50 text-gray-600 font-semibold border-b border-slate-200">
              <tr>
                <th className="py-2 px-2.5 font-semibold text-gray-700">Size</th>
                <th className="py-2 px-2.5">Chest (Width)</th>
                <th className="py-2 px-2.5">Body Length</th>
                <th className="py-2 px-2.5">Shoulder</th>
                <th className="py-2 px-2.5">Sleeve</th>
              </tr>
            </thead>
            <tbody className="divide-y divide-slate-100 text-gray-700">
              {rows.map((r, idx) => (
                <tr key={r.size} className={idx % 2 === 0 ? 'bg-white' : 'bg-slate-50/50'}>
                  <td className="py-1.5 px-2.5 font-semibold text-brand-orange">{r.size}</td>
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
          <h4 className="text-xs font-semibold text-orange-950 uppercase tracking-wider mb-2 flex items-center gap-1.5">
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
          </ul>
        </div>
      </div>
    </Modal>
  )
}
