import React from 'react'

const STAGE_TONAL_COLORS = {
  awaiting_production: '#94A3B8', // Slate 400
  in_production: '#64748B',       // Slate 500
  preparing: '#475569',           // Slate 600
  ready_pickup: '#3B82F6',        // Brand blue accent
  ready_dispatch: '#F97316',      // Brand orange accent
  in_transit: '#475569',          // Slate 600
}

const DEFAULT_TONAL_PALETTE = [
  '#94A3B8',
  '#64748B',
  '#475569',
  '#3B82F6',
  '#F97316',
  '#64748B',
]

export default function BarChartStages({ stages = [] }) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1)

  return (
    <div className="space-y-4 pt-1">
      {stages.map((stage, idx) => {
        const percentage = Math.max(12, (stage.count / maxCount) * 100)
        // Ensure monochromatic tonal scale even if legacy rainbow colors exist in localStorage
        const barColor =
          STAGE_TONAL_COLORS[stage.key] ||
          (stage.color && !['#F97316', '#EAB308', '#3B82F6', '#10B981', '#8B5CF6', '#06B6D4'].includes(stage.color)
            ? stage.color
            : DEFAULT_TONAL_PALETTE[idx % DEFAULT_TONAL_PALETTE.length])

        return (
          <div key={stage.key} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-medium text-[#0F172A] tracking-tight">{stage.label}</span>
              <div className="flex items-baseline gap-1.5 text-right tabular-nums">
                <span className="font-bold text-[#0F172A]">{stage.count}</span>
                <span className="text-[10px] text-slate-400 uppercase font-semibold">ORDERS</span>
              </div>
            </div>

            {/* Inactive light neutral gray track (#F1F5F9) */}
            <div className="w-full bg-[#F1F5F9] rounded-full h-2.5 overflow-hidden flex items-center">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: barColor,
                }}
              />
            </div>
          </div>
        )
      })}

      {/* Axis Scale Markers */}
      <div className="flex justify-between items-center text-[10px] font-medium text-slate-400 pt-2.5 border-t border-slate-100 tabular-nums">
        <span>0</span>
        <span>5</span>
        <span>10</span>
        <span>15+</span>
      </div>
    </div>
  )
}
