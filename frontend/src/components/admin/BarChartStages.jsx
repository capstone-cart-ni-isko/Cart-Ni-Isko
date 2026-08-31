import React from 'react'

export default function BarChartStages({ stages = [] }) {
  const maxCount = Math.max(...stages.map((s) => s.count), 1)

  return (
    <div className="space-y-4 pt-2">
      {stages.map((stage) => {
        const percentage = Math.max(12, (stage.count / maxCount) * 100)

        return (
          <div key={stage.key} className="space-y-1.5">
            <div className="flex items-center justify-between text-xs">
              <span className="font-semibold text-gray-700">{stage.label}</span>
              <div className="text-right">
                <span className="font-bold text-gray-900">{stage.count}</span>
                <span className="text-[10px] text-gray-400 uppercase font-semibold ml-1">ORDERS</span>
              </div>
            </div>

            <div className="w-full bg-gray-100/90 rounded-full h-3 overflow-hidden flex items-center p-0.5">
              <div
                className="h-full rounded-full transition-all duration-700 ease-out"
                style={{
                  width: `${percentage}%`,
                  backgroundColor: stage.color,
                }}
              />
            </div>
          </div>
        )
      })}

      {/* Axis Scale Markers */}
      <div className="flex justify-between items-center text-[10px] font-semibold text-gray-400 pt-2 border-t border-gray-100">
        <span>0</span>
        <span>5</span>
        <span>10</span>
        <span>15+</span>
      </div>
    </div>
  )
}
