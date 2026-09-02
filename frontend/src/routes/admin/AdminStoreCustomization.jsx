import React, { useState } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import ToggleSwitch from '../../components/admin/ToggleSwitch.jsx'
import DrawerPanel from '../../components/admin/DrawerPanel.jsx'
import { getImageUrl } from '../../utils/imageUtils.js'

import { INITIAL_ADMIN_DATA } from '../../data/adminMockData.js'

export default function AdminStoreCustomization() {
  const {
    adminState = {},
    updateStoreSettings,
  } = useAdmin()

  const initialSettings = adminState?.storeSettings || INITIAL_ADMIN_DATA.storeSettings

  // Local form state for unsaved edits
  const [isPhysicalOpen, setIsPhysicalOpen] = useState(initialSettings?.isPhysicalStoreOpen ?? true)
  const [allowPickups, setAllowPickups] = useState(initialSettings?.allowInStorePickups ?? true)
  const [acceptOnline, setAcceptOnline] = useState(initialSettings?.acceptOnlineOrders ?? true)
  const [announcementText, setAnnouncementText] = useState(initialSettings?.announcementBanner || '')
  const [slides, setSlides] = useState(initialSettings?.slides || INITIAL_ADMIN_DATA.storeSettings.slides || [])
  const [expandedSlideId, setExpandedSlideId] = useState(slides[0]?.id || null)

  // Drawer preview state
  const [showPreviewDrawer, setShowPreviewDrawer] = useState(false)
  const [isSavedToast, setIsSavedToast] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)

  const handleTogglePhysical = (val) => {
    setIsPhysicalOpen(val)
    setHasUnsavedChanges(true)
  }

  const handleTogglePickups = (val) => {
    setAllowPickups(val)
    setHasUnsavedChanges(true)
  }

  const handleToggleOnline = (val) => {
    setAcceptOnline(val)
    setHasUnsavedChanges(true)
  }

  const handleAnnouncementChange = (val) => {
    setAnnouncementText(val)
    setHasUnsavedChanges(true)
  }

  const handleSlideChange = (slideId, field, value) => {
    setSlides((prev) =>
      prev.map((s) => (s.id === slideId ? { ...s, [field]: value } : s))
    )
    setHasUnsavedChanges(true)
  }

  const handleAddNewSlide = () => {
    const newSlide = {
      id: `slide-${Date.now()}`,
      title: 'New Featured Merch',
      subtext: 'Special Bicol University Edition',
      ctaLabel: 'Shop Now',
      ctaLink: '/shop',
      bannerImage: 'banner-new.jpg',
      imagePreview: '/src/assets/Images/unnamed (1).png',
    }
    setSlides([...slides, newSlide])
    setExpandedSlideId(newSlide.id)
    setHasUnsavedChanges(true)
  }

  const handleDeleteSlide = (slideId) => {
    setSlides(slides.filter((s) => s.id !== slideId))
    setHasUnsavedChanges(true)
  }

  const handleMoveSlide = (index, direction) => {
    const nextIdx = index + direction
    if (nextIdx < 0 || nextIdx >= slides.length) return
    const updated = [...slides]
    const temp = updated[index]
    updated[index] = updated[nextIdx]
    updated[nextIdx] = temp
    setSlides(updated)
    setHasUnsavedChanges(true)
  }

  const handleDiscard = () => {
    setIsPhysicalOpen(initialSettings.isPhysicalStoreOpen)
    setAllowPickups(initialSettings.allowInStorePickups)
    setAcceptOnline(initialSettings.acceptOnlineOrders)
    setAnnouncementText(initialSettings.announcementBanner)
    setSlides(initialSettings.slides || [])
    setHasUnsavedChanges(false)
  }

  const handlePublish = () => {
    updateStoreSettings({
      isPhysicalStoreOpen: isPhysicalOpen,
      allowInStorePickups: allowPickups,
      acceptOnlineOrders: acceptOnline,
      announcementBanner: announcementText,
      slides,
      lastBannerEdit: 'Today',
    })
    setHasUnsavedChanges(false)
    setIsSavedToast(true)
    setTimeout(() => setIsSavedToast(false), 3500)
  }

  return (
    <AdminLayout>
      <div className="space-y-6 pb-24 relative">
        {/* Page Header */}
        <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-4">
          <div>
            <h1 className="text-2xl lg:text-3xl font-black text-gray-900 tracking-tight">
              Store Customization
            </h1>
            <p className="text-xs text-gray-400 font-bold uppercase tracking-wider mt-0.5">
              Omnichannel Manager
            </p>
          </div>

          {/* Trigger Live Store Preview Drawer */}
          <button
            type="button"
            onClick={() => setShowPreviewDrawer(true)}
            className="px-4 py-2 bg-white hover:bg-gray-50 text-gray-800 font-bold text-xs rounded-xl border border-gray-200 shadow-2xs flex items-center gap-2 transition-colors self-start sm:self-auto"
          >
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4 text-brand-orange">
              <rect x="5" y="2" width="14" height="20" rx="2" ry="2" />
              <line x1="12" y1="18" x2="12.01" y2="18" />
            </svg>
            <span>Live Store Preview</span>
          </button>
        </div>

        {/* Top 3 Info Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4">
          <div className="bg-white rounded-2xl p-4 border border-gray-100/90 shadow-xs">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Store Status
            </p>
            <div className="flex items-center gap-2 mt-1">
              <span className={`w-2.5 h-2.5 rounded-full ${isPhysicalOpen ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <p className="text-sm font-black text-gray-900">
                {isPhysicalOpen ? 'Store Open' : 'Store Closed'}
              </p>
            </div>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-100/90 shadow-xs">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Banner Edits
            </p>
            <p className="text-sm font-black text-gray-900 mt-1">
              Last Edit: Today
            </p>
          </div>

          <div className="bg-white rounded-2xl p-4 border border-gray-100/90 shadow-xs">
            <p className="text-[11px] font-bold text-gray-400 uppercase tracking-wider">
              Live Slide Count
            </p>
            <p className="text-sm font-black text-gray-900 mt-1">
              {slides.length} Active Slides
            </p>
          </div>
        </div>

        {/* Section 1: Store Operational Status & Announcements */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100/90 shadow-xs space-y-6">
          <div>
            <h2 className="text-base font-black text-gray-900">
              Store Operational Status &amp; Announcements
            </h2>
            <p className="text-xs text-gray-400 font-medium mt-0.5">
              Toggle store visibility and update public announcements.
            </p>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4 pt-2">
            <div className="p-4 rounded-xl bg-gray-50/70 border border-gray-100">
              <ToggleSwitch
                label="Physical Store Operational Status"
                description="Controls in-person desk open flag"
                checked={isPhysicalOpen}
                onChange={handleTogglePhysical}
              />
            </div>

            <div className="p-4 rounded-xl bg-gray-50/70 border border-gray-100">
              <ToggleSwitch
                label="Allow In-Store Pickups"
                description="Campus claim stations active"
                checked={allowPickups}
                onChange={handleTogglePickups}
              />
            </div>

            <div className="p-4 rounded-xl bg-gray-50/70 border border-gray-100">
              <ToggleSwitch
                label="Accept Online Orders"
                description="Cart checkout enabled"
                checked={acceptOnline}
                onChange={handleToggleOnline}
              />
            </div>
          </div>

          {/* Announcement Banner Field */}
          <div className="space-y-1.5 pt-2">
            <label className="block text-xs font-bold text-gray-700">
              Store Announcement Banner
            </label>
            <input
              type="text"
              value={announcementText}
              onChange={(e) => handleAnnouncementChange(e.target.value)}
              placeholder="e.g. Welcome to Tindahan ni Isko! Free shipping on orders over ₱500."
              className="w-full p-3 bg-gray-50 border border-gray-200 rounded-xl text-xs font-semibold focus:outline-none focus:bg-white focus:ring-2 focus:ring-brand-orange"
            />
            <p className="text-[11px] text-gray-400">
              This banner appears at the very top of your customer-facing store.
            </p>
          </div>
        </div>

        {/* Section 2: Hero Banner & Slideshow */}
        <div className="bg-white rounded-2xl p-6 border border-gray-100/90 shadow-xs space-y-6">
          <div className="flex flex-col sm:flex-row sm:items-center justify-between gap-3">
            <div>
              <h2 className="text-base font-black text-gray-900">
                Hero Banner &amp; Slideshow
              </h2>
              <p className="text-xs text-gray-400 font-medium mt-0.5">
                Design the primary hero section of your storefront.
              </p>
            </div>

            <button
              type="button"
              onClick={handleAddNewSlide}
              className="px-3.5 py-1.5 bg-gray-100 hover:bg-gray-200 text-gray-800 font-bold text-xs rounded-xl flex items-center gap-1.5 transition-colors self-start sm:self-auto"
            >
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                <line x1="12" y1="5" x2="12" y2="19" />
                <line x1="5" y1="12" x2="19" y2="12" />
              </svg>
              <span>Add New Slide</span>
            </button>
          </div>

          {/* Slides Accordion List */}
          <div className="space-y-3">
            {slides.map((slide, idx) => {
              const isExpanded = expandedSlideId === slide.id

              return (
                <div
                  key={slide.id}
                  className={`rounded-2xl border transition-all ${
                    isExpanded
                      ? 'border-brand-orange/40 bg-white shadow-sm'
                      : 'border-gray-200 bg-gray-50/50'
                  }`}
                >
                  {/* Accordion Header Bar */}
                  <div className="p-4 flex items-center justify-between gap-3">
                    <div className="flex items-center gap-3 min-w-0">
                      {/* Drag / Reorder Handles */}
                      <div className="flex flex-col gap-0.5 text-gray-400">
                        <button
                          type="button"
                          disabled={idx === 0}
                          onClick={() => handleMoveSlide(idx, -1)}
                          className="hover:text-gray-900 disabled:opacity-20 p-0.5"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
                            <polyline points="18 15 12 9 6 15" />
                          </svg>
                        </button>
                        <button
                          type="button"
                          disabled={idx === slides.length - 1}
                          onClick={() => handleMoveSlide(idx, 1)}
                          className="hover:text-gray-900 disabled:opacity-20 p-0.5"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                      </div>

                      <span className="text-xs font-black text-gray-900 truncate">
                        {slide.title || `Slide ${idx + 1}`}
                      </span>
                    </div>

                    <div className="flex items-center gap-2">
                      <button
                        type="button"
                        onClick={() =>
                          setExpandedSlideId(isExpanded ? null : slide.id)
                        }
                        className="p-1.5 rounded-lg text-gray-400 hover:text-gray-700 transition-colors"
                      >
                        <svg
                          viewBox="0 0 24 24"
                          fill="none"
                          stroke="currentColor"
                          strokeWidth="2.5"
                          className={`w-4 h-4 transform transition-transform ${
                            isExpanded ? 'rotate-180' : ''
                          }`}
                        >
                          <polyline points="6 9 12 15 18 9" />
                        </svg>
                      </button>

                      <button
                        type="button"
                        onClick={() => handleDeleteSlide(slide.id)}
                        className="p-1.5 rounded-lg text-gray-400 hover:text-rose-600 transition-colors"
                      >
                        <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
                          <polyline points="3 6 5 6 21 6" />
                          <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                        </svg>
                      </button>
                    </div>
                  </div>

                  {/* Accordion Expanded Content */}
                  {isExpanded && (
                    <div className="p-4 pt-0 border-t border-gray-100 space-y-4 text-xs">
                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3 pt-3">
                        <div>
                          <label className="block font-bold text-gray-700 mb-1">Title</label>
                          <input
                            type="text"
                            value={slide.title}
                            onChange={(e) =>
                              handleSlideChange(slide.id, 'title', e.target.value)
                            }
                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-orange"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-gray-700 mb-1">Subtext</label>
                          <input
                            type="text"
                            value={slide.subtext}
                            onChange={(e) =>
                              handleSlideChange(slide.id, 'subtext', e.target.value)
                            }
                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-orange"
                          />
                        </div>
                      </div>

                      <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                        <div>
                          <label className="block font-bold text-gray-700 mb-1">CTA Label</label>
                          <input
                            type="text"
                            value={slide.ctaLabel}
                            onChange={(e) =>
                              handleSlideChange(slide.id, 'ctaLabel', e.target.value)
                            }
                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-orange"
                          />
                        </div>
                        <div>
                          <label className="block font-bold text-gray-700 mb-1">CTA Link</label>
                          <input
                            type="text"
                            value={slide.ctaLink}
                            onChange={(e) =>
                              handleSlideChange(slide.id, 'ctaLink', e.target.value)
                            }
                            className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-xl focus:outline-none focus:ring-1 focus:ring-brand-orange"
                          />
                        </div>
                      </div>

                      {/* Banner Image Preview / Dropzone */}
                      <div className="space-y-1.5">
                        <label className="block font-bold text-gray-700">Banner Image</label>
                        <div className="p-4 border-2 border-dashed border-gray-200 rounded-2xl flex items-center justify-between gap-4 bg-gray-50">
                          <div className="flex items-center gap-3">
                            <img
                              src={getImageUrl(slide.imagePreview)}
                              alt="Slide preview"
                              className="w-14 h-14 rounded-xl object-cover border border-gray-200"
                            />
                            <div>
                              <p className="font-bold text-gray-900 text-xs">{slide.bannerImage}</p>
                              <p className="text-[10px] text-gray-400 font-semibold">Recommended: 1200x500 JPG/PNG</p>
                            </div>
                          </div>
                          <button
                            type="button"
                            onClick={() => alert('Image selector: Selected default theme asset.')}
                            className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-xl text-xs font-bold text-gray-700"
                          >
                            Replace Image
                          </button>
                        </div>
                      </div>
                    </div>
                  )}
                </div>
              )
            })}
          </div>
        </div>

        {/* Sticky Bottom Bar */}
        <div className="fixed bottom-0 right-0 left-0 md:left-64 bg-white/95 backdrop-blur-md border-t border-gray-200 p-4 px-6 md:px-8 flex items-center justify-between gap-4 z-20 shadow-lg">
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                hasUnsavedChanges ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
              }`}
            />
            <span className="text-xs font-bold text-gray-600">
              {hasUnsavedChanges ? 'Unsaved changes' : 'All changes published'}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={!hasUnsavedChanges}
              onClick={handleDiscard}
              className="px-4 py-2 bg-gray-100 hover:bg-gray-200 disabled:opacity-40 text-gray-700 font-bold text-xs rounded-xl transition-colors"
            >
              Discard
            </button>
            <button
              type="button"
              onClick={handlePublish}
              className="px-4 py-2 bg-gray-900 hover:bg-black text-white font-bold text-xs rounded-xl transition-colors"
            >
              Save Draft
            </button>
            <button
              type="button"
              onClick={handlePublish}
              className="px-5 py-2 bg-brand-orange hover:bg-brand-orange-dark text-white font-black text-xs rounded-xl shadow-xs transition-colors"
            >
              Publish Changes
            </button>
          </div>
        </div>

        {/* Toast confirmation */}
        {isSavedToast && (
          <div className="fixed bottom-20 right-8 bg-gray-900 text-white text-xs font-bold py-3 px-5 rounded-2xl shadow-2xl flex items-center gap-2 animate-slide-up z-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-emerald-400">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Store settings &amp; hero banners successfully published!</span>
          </div>
        )}
      </div>

      {/* Live Store Preview Side Drawer */}
      <DrawerPanel
        isOpen={showPreviewDrawer}
        onClose={() => setShowPreviewDrawer(false)}
        title="Live Storefront Preview"
        subtitle="Real-time mobile simulation of Tindahan ni Isko"
        width="max-w-md"
      >
        <div className="space-y-4">
          {/* Announcement Banner Simulator */}
          <div className="bg-brand-orange text-white text-[11px] font-bold p-2.5 rounded-xl text-center shadow-xs flex items-center justify-center gap-1.5">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-4 h-4">
              <path d="M18 8A6 6 0 0 0 6 8c0 7-3 9-3 9h18s-3-2-3-9" />
              <path d="M13.73 21a2 2 0 0 1-3.46 0" />
            </svg>
            <span>{announcementText}</span>
          </div>

          {/* Operational Status Pill Simulator */}
          <div className="flex justify-between items-center bg-gray-50 p-3 rounded-xl border border-gray-200/80 text-xs">
            <span className="font-semibold text-gray-600">Store Status</span>
            <span
              className={`font-black px-2.5 py-0.5 rounded-full text-[10px] ${
                isPhysicalOpen
                  ? 'bg-emerald-100 text-emerald-800'
                  : 'bg-rose-100 text-rose-800'
              }`}
            >
              {isPhysicalOpen ? 'OPEN FOR PICKUP' : 'CLOSED'}
            </span>
          </div>

          {/* Active Hero Slide Simulator */}
          {slides.length > 0 && (
            <div className="rounded-2xl overflow-hidden bg-slate-900 relative h-48 shadow-md text-white p-5 flex flex-col justify-end">
              <div
                className="absolute inset-0 bg-cover bg-center opacity-60"
                style={{
                  backgroundImage: `url(${getImageUrl(slides[0].imagePreview)})`,
                }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <div className="relative z-10 space-y-1.5">
                <span className="inline-block bg-brand-orange text-white text-[9px] font-black uppercase px-2.5 py-0.5 rounded-full">
                  {slides[0].subtext}
                </span>
                <h3 className="text-xl font-black">{slides[0].title}</h3>
                <button
                  type="button"
                  className="mt-2 inline-flex items-center gap-1 px-3 py-1 bg-white text-gray-900 text-xs font-black rounded-lg shadow-sm"
                >
                  <span>{slides[0].ctaLabel}</span>
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3 h-3">
                    <polyline points="9 18 15 12 9 6" />
                  </svg>
                </button>
              </div>
            </div>
          )}
        </div>
      </DrawerPanel>
    </AdminLayout>
  )
}
