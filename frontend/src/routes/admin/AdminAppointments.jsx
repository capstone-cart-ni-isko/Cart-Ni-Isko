import React, { useState } from 'react'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import { useAdmin } from '../../hooks/useAdmin.js'
import { CloseIcon } from '../../components/ui/Icons.jsx'

export default function AdminAppointments() {
  const { currentAdminUser } = useAdmin() || {}
  const [currentDate] = useState('Tue, Apr 22, 2025')
  const [showDeclineModal, setShowDeclineModal] = useState(false)
  const [selectedDay, setSelectedDay] = useState('Tue')

  const staffName = currentAdminUser?.name ? currentAdminUser.name.split(' ')[0] : 'Maria'

  const timelineItems = [
    {
      time: '7:00 AM – 8:00 AM',
      type: 'class',
      typeLabel: 'Class',
      title: 'Mathematics 101',
      location: 'Room 203',
      icon: 'book',
    },
    {
      time: '8:30 AM – 10:00 AM',
      type: 'class',
      typeLabel: 'Class',
      title: 'English Communication',
      location: 'Room 105',
      icon: 'book',
    },
    {
      time: '10:00 AM – 1:00 PM',
      type: 'shift',
      typeLabel: 'Assigned Shift',
      title: 'Desk Duty',
      location: 'Student Council Office',
      subtext: 'With: Carlos M. (Lead)',
      icon: 'desk',
    },
    {
      time: '1:00 PM – 2:30 PM',
      type: 'class',
      typeLabel: 'Class',
      title: 'Computer Science',
      location: 'Lab 2',
      icon: 'book',
    },
    {
      time: '2:30 PM – 3:30 PM',
      type: 'free',
      typeLabel: 'Free Time',
      title: '1 hr available',
      subtitle: 'Need a shift? You can pick up an open shift.',
      action: '+ Pick Up Shift',
      icon: 'clock',
    },
    {
      time: '3:30 PM – 5:00 PM',
      type: 'class',
      typeLabel: 'Class',
      title: 'Philippine History',
      location: 'Room 201',
      icon: 'book',
    },
  ]

  const weekDays = [
    { day: 'Mon', hours: '8h', status: 'free' },
    { day: 'Tue', hours: '6h', status: 'shift' },
    { day: 'Wed', hours: '4h', status: 'free' },
    { day: 'Thu', hours: '8h', status: 'free' },
    { day: 'Fri', hours: '5h', status: 'free' },
    { day: 'Sat', hours: '0h', status: 'busy' },
    { day: 'Sun', hours: '0h', status: 'busy' },
  ]

  return (
    <AdminLayout>
      <div className="space-y-4 animate-fade-in">
        {/* Compacted Top Greeting Bar */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-2.5">
          <div>
            <h1 className="text-lg sm:text-xl font-bold text-slate-900 flex items-center gap-2">
              <span>Good morning, {staffName}!</span>
            </h1>
            <p className="text-xs text-slate-500 font-normal mt-0.5">
              Here's your assigned shift and today's schedule at a glance.
            </p>
          </div>

          {/* Date Selector Badge */}
          <div className="flex items-center gap-1 bg-white border border-slate-200 rounded-md px-2 py-1 self-start sm:self-auto">
            <div className="flex items-center gap-2 px-2 py-0.5 text-xs font-semibold text-slate-800">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-400">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <span>{currentDate}</span>
            </div>
            <div className="flex items-center gap-0.5 border-l border-slate-100 pl-1">
              <button type="button" className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                  <polyline points="15 18 9 12 15 6" />
                </svg>
              </button>
              <button type="button" className="p-0.5 rounded text-slate-400 hover:text-slate-700 hover:bg-slate-100 transition-colors cursor-pointer">
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                  <polyline points="9 18 15 12 9 6" />
                </svg>
              </button>
            </div>
          </div>
        </div>

        {/* 2-Column Grid */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-4 items-start">
          {/* Left Column (8 cols) */}
          <div className="lg:col-span-8 space-y-4">
            {/* 1. Assigned Shift Card */}
            <div className="bg-[#FFF9F5] border border-[#FFE7D6] rounded-lg p-4 relative overflow-hidden">
              <div className="flex flex-col md:flex-row items-start justify-between gap-4">
                {/* Shift Info */}
                <div className="flex items-start gap-3">
                  <div className="w-10 h-10 rounded-md bg-[#FFE8D6] text-[#FF6A00] flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                      <rect x="2" y="7" width="20" height="14" rx="2" ry="2" />
                      <path d="M16 21V5a2 2 0 0 0-2-2h-4a2 2 0 0 0-2 2v16" />
                    </svg>
                  </div>
                  <div className="space-y-1">
                    <span className="inline-block bg-[#FFEDE1] text-[#E65100] text-[10px] font-bold uppercase tracking-wider px-2 py-0.5 rounded-md">
                      Assigned Shift
                    </span>
                    <h2 className="text-base font-bold text-slate-900">Desk Duty</h2>
                    <div className="space-y-0.5 text-xs text-slate-600 font-medium">
                      <div className="flex items-center gap-1.5">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-400">
                          <path d="M21 10c0 7-9 13-9 13s-9-6-9-13a9 9 0 0 1 18 0z" />
                          <circle cx="12" cy="10" r="3" />
                        </svg>
                        <span>Student Council Office</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-400">
                          <circle cx="12" cy="12" r="10" />
                          <polyline points="12 6 12 12 16 14" />
                        </svg>
                        <span className="font-bold text-slate-800">10:00 AM – 1:00 PM</span>
                      </div>
                      <div className="flex items-center gap-1.5">
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-slate-400">
                          <path d="M20 21v-2a4 4 0 0 0-4-4H8a4 4 0 0 0-4 4v2" />
                          <circle cx="12" cy="7" r="4" />
                        </svg>
                        <span>With: Carlos M. (Lead)</span>
                      </div>
                    </div>
                  </div>
                </div>

                {/* Shift Details Bullets */}
                <div className="space-y-1 text-xs text-slate-600 border-t md:border-t-0 md:border-l border-orange-100 pt-2.5 md:pt-0 md:pl-4">
                  <p className="font-semibold text-slate-900 mb-0.5">Shift Details</p>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                    <span>Assist with student inquiries</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                    <span>Update records and documents</span>
                  </div>
                  <div className="flex items-center gap-2">
                    <span className="w-1.5 h-1.5 rounded-full bg-orange-400" />
                    <span>Coordinate with other officers</span>
                  </div>
                </div>

                {/* View Details Button */}
                <button
                  type="button"
                  className="self-start md:self-center border border-[#FF6A00] text-[#FF6A00] bg-white hover:bg-orange-50 text-xs font-semibold h-8 px-3 rounded-md flex items-center gap-1.5 whitespace-nowrap cursor-pointer"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <span>View Details</span>
                </button>
              </div>
            </div>

            {/* 2. Today's Timeline */}
            <div className="bg-white rounded-lg p-4 border border-slate-200 space-y-4">
              {/* Timeline Header */}
              <div className="flex items-center justify-between">
                <div className="flex items-center gap-3">
                  <div className="w-10 h-10 rounded-2xl bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center shrink-0">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-5 h-5">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <div>
                    <h2 className="text-lg font-black text-gray-900">Today's Timeline</h2>
                    <p className="text-xs text-gray-400 mt-0.5">Your classes and assigned shifts in chronological order.</p>
                  </div>
                </div>

                <div className="flex items-center gap-1 text-xs text-gray-500 font-semibold bg-gray-50 px-2 py-1 rounded-xl border border-gray-100">
                  <button type="button" className="p-1 hover:text-gray-900">‹</button>
                  <span className="px-1.5">Tue, Apr 22, 2025</span>
                  <button type="button" className="p-1 hover:text-gray-900">›</button>
                </div>
              </div>

              {/* Timeline Items */}
              <div className="space-y-4 relative before:absolute before:left-[102px] before:top-4 before:bottom-4 before:w-0.5 before:bg-gray-100">
                {timelineItems.map((item, idx) => {
                  const isShift = item.type === 'shift'
                  const isFree = item.type === 'free'

                  return (
                    <div key={idx} className="flex items-center gap-4 relative">
                      {/* Time Column (Left) */}
                      <div className="w-24 text-right shrink-0">
                        <p className={`text-xs font-bold leading-tight ${isShift ? 'text-[#FF6A00]' : 'text-gray-700'}`}>
                          {item.time.split('–')[0]}
                        </p>
                        <p className="text-[11px] text-gray-400">
                          {item.time.split('–')[1] ? `– ${item.time.split('–')[1]}` : ''}
                        </p>
                        {/* Type Badge */}
                        <span
                          className={`inline-block text-[10px] font-bold px-2 py-0.5 rounded-full mt-1 ${
                            isShift
                              ? 'bg-[#FFE2D1] text-[#E65100]'
                              : isFree
                              ? 'bg-[#E8F8EE] text-[#10B981]'
                              : 'bg-gray-100 text-gray-600'
                          }`}
                        >
                          {item.typeLabel}
                        </span>
                      </div>

                      {/* Timeline Dot */}
                      <div
                        className={`w-3 h-3 rounded-full border-2 border-white z-10 shrink-0 ${
                          isShift
                            ? 'bg-[#FF6A00] ring-2 ring-orange-100'
                            : isFree
                            ? 'bg-[#10B981] ring-2 ring-emerald-100'
                            : 'bg-slate-300'
                        }`}
                      />

                      {/* Content Card (Right) */}
                      <div
                        className={`flex-1 rounded-md p-3 flex items-center justify-between gap-3 transition-all ${
                          isShift
                            ? 'bg-[#FFF5ED] border border-[#FFE2D1]'
                            : isFree
                            ? 'bg-[#F0FDF4] border border-[#DCFCE7]'
                            : 'bg-slate-50 border border-slate-200 hover:bg-slate-100/60'
                        }`}
                      >
                        <div className="flex items-center gap-3 min-w-0">
                          <div
                            className={`w-8 h-8 rounded-md flex items-center justify-center shrink-0 ${
                              isShift
                                ? 'bg-[#FFE8D6] text-[#FF6A00]'
                                : isFree
                                ? 'bg-emerald-100 text-[#10B981]'
                                : 'bg-white text-slate-500 border border-slate-200'
                            }`}
                          >
                            {item.icon === 'desk' ? (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                                <rect x="3" y="4" width="18" height="12" rx="2" />
                                <line x1="7" y1="20" x2="7" y2="16" />
                                <line x1="17" y1="20" x2="17" y2="16" />
                              </svg>
                            ) : item.icon === 'clock' ? (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                                <circle cx="12" cy="12" r="10" />
                                <polyline points="12 6 12 12 16 14" />
                              </svg>
                            ) : (
                              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-5 h-5">
                                <path d="M4 19.5A2.5 2.5 0 0 1 6.5 17H20" />
                                <path d="M6.5 2H20v20H6.5A2.5 2.5 0 0 1 4 19.5v-15A2.5 2.5 0 0 1 6.5 2z" />
                              </svg>
                            )}
                          </div>

                          <div className="min-w-0">
                            <p className="text-sm font-bold text-gray-900 truncate">{item.title}</p>
                            {item.location && (
                              <p className="text-xs text-gray-500 flex items-center gap-1 mt-0.5">
                                <span>{item.location}</span>
                                {item.subtext && <span>• {item.subtext}</span>}
                              </p>
                            )}
                            {item.subtitle && (
                              <p className="text-xs text-gray-500 mt-0.5">{item.subtitle}</p>
                            )}
                          </div>
                        </div>

                        {/* Action on right */}
                        {isFree ? (
                          <button
                            type="button"
                            className="text-xs font-bold px-3 py-1.5 rounded-xl border border-emerald-300 text-emerald-700 bg-white hover:bg-emerald-50 active:scale-95 transition-all shadow-2xs whitespace-nowrap cursor-pointer"
                          >
                            {item.action}
                          </button>
                        ) : (
                          <span className="text-gray-300 text-lg">›</span>
                        )}
                      </div>
                    </div>
                  )
                })}
              </div>
            </div>

            {/* 3. Can't make it to a shift? Banner */}
            <div className="bg-[#FFF8F3] border border-[#FFE5D3] rounded-3xl p-5 flex flex-col sm:flex-row items-center justify-between gap-4 shadow-2xs">
              <div className="flex items-start gap-3">
                <div className="w-7 h-7 rounded-full bg-orange-100 text-[#FF6A00] flex items-center justify-center shrink-0 mt-0.5 font-bold text-xs">
                  i
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900">Can't make it to a shift?</h4>
                  <p className="text-xs text-gray-600 mt-0.5">
                    If you're unavailable, you can decline the shift and let your lead know the reason.
                  </p>
                </div>
              </div>

              <button
                type="button"
                onClick={() => setShowDeclineModal(true)}
                className="border border-brand-orange text-brand-orange bg-white hover:bg-orange-50 font-bold text-xs h-8 px-3 rounded-md whitespace-nowrap cursor-pointer self-end sm:self-center transition-colors"
              >
                Decline Shift
              </button>
            </div>
          </div>

          {/* Right Column (4 cols) */}
          <div className="lg:col-span-4 space-y-6">
            {/* 1. Weekly Availability Summary */}
            <div className="bg-white rounded-3xl p-6 border border-gray-100/90 shadow-xs space-y-4">
              <div className="flex items-start gap-3">
                <div className="w-9 h-9 rounded-2xl bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center shrink-0">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.2" className="w-5 h-5">
                    <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                    <line x1="16" y1="2" x2="16" y2="6" />
                    <line x1="8" y1="2" x2="8" y2="6" />
                    <line x1="3" y1="10" x2="21" y2="10" />
                  </svg>
                </div>
                <div>
                  <h3 className="text-base font-black text-gray-900 leading-tight">Weekly Availability Summary</h3>
                  <p className="text-xs text-gray-500 font-medium mt-0.5">14 free hours available this week</p>
                </div>
              </div>

              {/* Day Pillars */}
              <div className="grid grid-cols-7 gap-1.5 pt-2">
                {weekDays.map((d) => {
                  const isSelected = selectedDay === d.day
                  return (
                    <button
                      type="button"
                      key={d.day}
                      onClick={() => setSelectedDay(d.day)}
                      className={`flex flex-col items-center py-2.5 px-1 rounded-2xl transition-all cursor-pointer ${
                        isSelected
                          ? 'border-2 border-blue-400 bg-blue-50/40 shadow-2xs'
                          : 'border border-gray-100 hover:bg-gray-50'
                      }`}
                    >
                      <span className="text-[11px] font-bold text-gray-600">{d.day}</span>
                      <span
                        className={`w-2 h-2 rounded-full my-2 ${
                          d.status === 'shift'
                            ? 'bg-[#FF6A00]'
                            : d.status === 'free'
                            ? 'bg-[#10B981]'
                            : 'bg-gray-300'
                        }`}
                      />
                      <span className="text-xs font-extrabold text-gray-800">{d.hours}</span>
                    </button>
                  )
                })}
              </div>

              {/* Legend */}
              <div className="flex items-center justify-between text-[11px] font-semibold text-gray-500 pt-2 border-t border-gray-100">
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#10B981]" />
                  <span>Free time</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-[#FF6A00]" />
                  <span>Assigned shift</span>
                </div>
                <div className="flex items-center gap-1.5">
                  <span className="w-2 h-2 rounded-full bg-gray-300" />
                  <span>Class / Busy</span>
                </div>
              </div>
            </div>

            {/* 2. Want more hours? */}
            <div className="bg-[#F0F7FF] border border-[#DCEBFE] rounded-3xl p-5 flex items-center justify-between gap-3 shadow-2xs hover:bg-blue-50/80 transition-colors cursor-pointer group">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-blue-100 text-[#2563EB] flex items-center justify-center shrink-0 mt-0.5">
                  <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4 text-[#2563EB]">
                    <polygon points="13 2 3 14 12 14 11 22 21 10 12 10 13 2" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-sm font-bold text-gray-900 group-hover:text-blue-700 transition-colors">
                    Want more hours?
                  </h4>
                  <p className="text-xs text-gray-600 mt-0.5 leading-relaxed">
                    You can pick up available shifts or report your availability for extra hours.
                  </p>
                </div>
              </div>
              <span className="text-gray-400 text-lg group-hover:text-blue-600 group-hover:translate-x-0.5 transition-all">›</span>
            </div>

            {/* 3. Quick Actions */}
            <div className="bg-white rounded-lg p-5 border border-slate-200 space-y-3">
              <div className="flex items-center gap-2">
                <h3 className="text-xs font-bold text-slate-900 uppercase tracking-wider">Quick Actions</h3>
              </div>

              <div className="grid grid-cols-2 gap-3">
                {/* View Full Schedule */}
                <button
                  type="button"
                  className="bg-[#F8F9FA] hover:bg-gray-100/80 active:scale-95 transition-all p-4 rounded-2xl border border-gray-100 text-left space-y-2 cursor-pointer shadow-2xs group"
                >
                  <div className="w-8 h-8 rounded-xl bg-blue-50 text-[#2563EB] flex items-center justify-center group-hover:scale-105 transition-transform">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                      <line x1="16" y1="2" x2="16" y2="6" />
                      <line x1="8" y1="2" x2="8" y2="6" />
                      <line x1="3" y1="10" x2="21" y2="10" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-black text-gray-900 leading-tight">View Full Schedule</p>
                    <p className="text-[10px] text-gray-500 font-medium mt-1 leading-snug">
                      See all committee schedules and availability.
                    </p>
                  </div>
                </button>

                {/* Need Help? */}
                <button
                  type="button"
                  className="bg-[#F8F9FA] hover:bg-gray-100/80 active:scale-95 transition-all p-4 rounded-2xl border border-gray-100 text-left space-y-2 cursor-pointer shadow-2xs group"
                >
                  <div className="w-8 h-8 rounded-xl bg-emerald-50 text-emerald-600 flex items-center justify-center group-hover:scale-105 transition-transform">
                    <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                      <circle cx="12" cy="12" r="10" />
                      <path d="M9.09 9a3 3 0 0 1 5.83 1c0 2-3 3-3 3" />
                      <line x1="12" y1="17" x2="12.01" y2="17" />
                    </svg>
                  </div>
                  <div>
                    <p className="text-xs font-black text-gray-900 leading-tight">Need Help?</p>
                    <p className="text-[10px] text-gray-500 font-medium mt-1 leading-snug">
                      Contact the admin or committee lead.
                    </p>
                  </div>
                </button>
              </div>
            </div>

            {/* 4. Reminder */}
            <div className="bg-white rounded-3xl p-5 border border-gray-100/90 shadow-xs flex items-center justify-between gap-3 hover:border-gray-200 transition-colors cursor-pointer group">
              <div className="flex items-start gap-3">
                <div className="w-8 h-8 rounded-xl bg-[#EBF2FF] text-[#2563EB] flex items-center justify-center shrink-0 mt-0.5">
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                    <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
                    <path d="M13.73 21a2 2 0 0 1-3.46 0" />
                  </svg>
                </div>
                <div>
                  <h4 className="text-xs font-black text-gray-900">Reminder</h4>
                  <p className="text-xs text-gray-500 font-medium mt-0.5 leading-relaxed">
                    Always communicate early if you're unable to take your assigned shift. It helps the team stay on track!
                  </p>
                </div>
              </div>
              <span className="text-gray-300 text-lg group-hover:text-gray-600 group-hover:translate-x-0.5 transition-all">›</span>
            </div>
          </div>
        </div>

        {/* Decline Modal */}
        {showDeclineModal && (
          <div className="fixed inset-0 z-[99999] flex items-center justify-center bg-black/60 backdrop-blur-md p-4 animate-fade-in">
            <div className="bg-white rounded-lg p-5 max-w-md w-full border border-slate-200 space-y-3">
              <div className="flex items-center justify-between">
                <h3 className="text-sm font-extrabold text-slate-900">Decline Shift</h3>
                <button
                  type="button"
                  onClick={() => setShowDeclineModal(false)}
                  className="text-slate-400 hover:text-slate-600 p-1 cursor-pointer"
                >
                  <CloseIcon className="w-3.5 h-3.5" />
                </button>
              </div>
              <p className="text-xs text-slate-600">
                Please provide a brief reason for declining your assigned shift on <strong>Tue, Apr 22, 2025 (10:00 AM – 1:00 PM)</strong>.
              </p>
              <textarea
                placeholder="e.g. Schedule conflict with laboratory exam..."
                rows={3}
                className="w-full p-2.5 rounded-md border border-slate-200 text-xs focus:outline-none focus:ring-1 focus:ring-brand-orange resize-none"
              />
              <div className="flex items-center justify-end gap-2 pt-1">
                <button
                  type="button"
                  onClick={() => setShowDeclineModal(false)}
                  className="h-8 px-3 rounded-md text-xs font-bold text-slate-600 hover:bg-slate-100 border border-slate-200 transition-colors cursor-pointer"
                >
                  Cancel
                </button>
                <button
                  type="button"
                  onClick={() => setShowDeclineModal(false)}
                  className="h-8 px-3 rounded-md text-xs font-bold text-white bg-red-600 hover:bg-red-700 transition-colors cursor-pointer"
                >
                  Submit Decline
                </button>
              </div>
            </div>
          </div>
        )}
      </div>
    </AdminLayout>
  )
}
