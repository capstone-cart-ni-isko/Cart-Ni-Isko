import { useState, useEffect, useRef } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import DrawerPanel from '../../components/admin/DrawerPanel.jsx'
import { getImageUrl } from '../../utils/imageUtils.js'
import { fetchSettings, updateSettings } from '../../services/settings.js'
import { uploadImage } from '../../services/upload.js'
import { DEFAULT_STORE_SLIDES, parseStoreSlides } from '../../data/storeSlides.js'
import SkeletonBlock from '../../components/ui/SkeletonBlock.jsx'

const MAX_BANNER_BYTES = 2 * 1024 * 1024 // 2 MB (mirrors POST /uploads limit)
const BANNER_MIME_TYPES = ['image/png', 'image/jpeg', 'image/webp']

export default function AdminStoreCustomization({ embedded = false }) {
  const { currentAdminUser } = useAdmin() || {}
  const { showToast } = useToast()

  // Real settings (GET /settings/display) — no mock fallback by design
  const [settings, setSettings] = useState(null)
  const [isLoading, setIsLoading] = useState(true)
  const [loadError, setLoadError] = useState('')
  const [reloadKey, setReloadKey] = useState(0)
  const [isSaving, setIsSaving] = useState(false)

  const [slides, setSlides] = useState([])
  const [editingSlideId, setEditingSlideId] = useState(null)
  const [draggingSlideId, setDraggingSlideId] = useState(null)
  const [dropTargetSlideId, setDropTargetSlideId] = useState(null)
  const [isSavedToast, setIsSavedToast] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showPreviewDrawer, setShowPreviewDrawer] = useState(false)

  // Replace-banner flow: one hidden file input shared by every slide row
  const replaceInputRef = useRef(null)
  const replaceTargetRef = useRef(null)
  const [uploadingSlideId, setUploadingSlideId] = useState(null)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setLoadError('')
    fetchSettings()
      .then((s) => {
        if (cancelled) return
        const data = s || {}
        setSettings(data)
        setSlides(parseStoreSlides(data.store_slides) ?? DEFAULT_STORE_SLIDES)
        setHasUnsavedChanges(false)
        setIsLoading(false)
      })
      .catch((err) => {
        if (cancelled) return
        setLoadError(err?.message || 'Unable to load store customization.')
        setIsLoading(false)
      })
    return () => {
      cancelled = true
    }
  }, [reloadKey])

  const isStoreOpen = settings
    ? settings.store_open ?? !(settings.maintenance_mode ?? false)
    : true
  const lastEdit = settings?.banner_last_edit || '—'
  const lastEditBy = settings?.banner_last_edit_by ? `by ${settings.banner_last_edit_by}` : '—'
  const bannerCount = `${slides.length} image${slides.length === 1 ? '' : 's'} uploaded`
  const bannerType = '(Hero Banner & Slideshow)'
  const previewSlide = slides[0]
  const previewImage = previewSlide
    ? getImageUrl(previewSlide.bannerImage || previewSlide.imagePreview || previewSlide.image)
    : ''

  const handleSlideChange = (slideId, field, value) => {
    setSlides((prev) =>
      prev.map((s) => (s.id === slideId ? { ...s, [field]: value } : s))
    )
    setHasUnsavedChanges(true)
  }

  const handleAddNewSlide = () => {
    const newSlide = {
      id: `slide-${Date.now()}`,
      title: 'New Slide',
      subtext: 'Add a subtitle here',
      ctaLabel: 'Shop Now',
      ctaLink: '/shop',
      bannerImage: DEFAULT_STORE_SLIDES[0].bannerImage,
      imagePreview: DEFAULT_STORE_SLIDES[0].imagePreview,
    }
    setSlides([...slides, newSlide])
    setEditingSlideId(newSlide.id)
    setHasUnsavedChanges(true)
  }

  const handleDeleteSlide = (slideId) => {
    setSlides(slides.filter((s) => s.id !== slideId))
    if (editingSlideId === slideId) setEditingSlideId(null)
    setHasUnsavedChanges(true)
  }

  const handleSlideDrop = (event, targetSlideId) => {
    event.preventDefault()
    const sourceIndex = slides.findIndex((slide) => slide.id === draggingSlideId)
    const targetIndex = slides.findIndex((slide) => slide.id === targetSlideId)
    if (sourceIndex < 0 || targetIndex < 0 || sourceIndex === targetIndex) {
      setDropTargetSlideId(null)
      return
    }

    const targetRow = event.currentTarget.getBoundingClientRect()
    const insertAfter = event.clientY >= targetRow.top + targetRow.height / 2
    const updated = [...slides]
    const [draggedSlide] = updated.splice(sourceIndex, 1)
    let insertIndex = targetIndex + (insertAfter ? 1 : 0)
    if (sourceIndex < insertIndex) insertIndex -= 1
    updated.splice(insertIndex, 0, draggedSlide)
    setSlides(updated)
    setHasUnsavedChanges(true)
    setDropTargetSlideId(null)
  }

  const handleDiscard = () => {
    setSlides(parseStoreSlides(settings?.store_slides) ?? DEFAULT_STORE_SLIDES)
    setHasUnsavedChanges(false)
    setEditingSlideId(null)
  }

  // ── Replace slide image: real file pick → POST /uploads → keep both fields ──
  const handleReplaceImageClick = (slideId) => {
    replaceTargetRef.current = slideId
    replaceInputRef.current?.click()
  }

  const handleReplaceImageChange = async (e) => {
    const file = e.target.files?.[0]
    e.target.value = '' // allow re-picking the same file
    const slideId = replaceTargetRef.current
    if (!file || !slideId) return
    if (!BANNER_MIME_TYPES.includes(file.type)) {
      showToast('Please choose a PNG, JPEG, or WebP image.', 'error')
      return
    }
    if (file.size > MAX_BANNER_BYTES) {
      showToast('Image size exceeds the 2MB limit.', 'error')
      return
    }
    setUploadingSlideId(slideId)
    try {
      const url = await uploadImage(file, 'banner')
      if (!url) throw new Error('Upload did not return an image URL.')
      // imagePreview drives every render; bannerImage is the persisted field.
      handleSlideChange(slideId, 'imagePreview', url)
      handleSlideChange(slideId, 'bannerImage', url)
      setHasUnsavedChanges(true)
      showToast('Banner image replaced. Click Save Changes to publish it.', 'success')
    } catch (err) {
      showToast(err?.message || 'Unable to upload the image.', 'error')
    } finally {
      setUploadingSlideId(null)
    }
  }

  const handleSaveChanges = async () => {
    if (isSaving) return
    setIsSaving(true)
    try {
      const storeSlides = JSON.stringify(slides)
      const stamp = new Date().toLocaleString('en-US', {
        month: 'short',
        day: 'numeric',
        year: 'numeric',
        hour: 'numeric',
        minute: '2-digit',
      })
      const editedBy = currentAdminUser?.name || 'Staff'
      await updateSettings({
        store_slides: storeSlides,
        banner_last_edit: stamp,
        banner_last_edit_by: editedBy,
      })
      setSettings((prev) => ({
        ...(prev || {}),
        store_slides: storeSlides,
        banner_last_edit: stamp,
        banner_last_edit_by: editedBy,
      }))
      setHasUnsavedChanges(false)
      setIsSavedToast(true)
      setTimeout(() => setIsSavedToast(false), 3500)
    } catch (err) {
      showToast(err?.message || 'Failed to save the slideshow.', 'error')
    } finally {
      setIsSaving(false)
    }
  }

  const content = (
    <>
      <div className="relative pb-24">
        {/* Page Header */}
        <div className="mb-5">
          <h1 className="text-2xl font-black text-gray-900">
            {embedded ? 'Storefront Banners' : 'Store Customization'}
          </h1>
          <p className="text-sm text-gray-500 mt-0.5">
            {embedded
              ? 'Change the banner images and action buttons customers see on the storefront.'
              : 'Update your store’s appearance and manage what your customers see on the storefront.'}
          </p>
        </div>

        {/* Load states */}
        {loadError && (
          <div className="mb-4 flex items-center justify-between gap-3 bg-red-50 border border-red-200 rounded-lg px-4 py-3">
            <p className="text-xs font-semibold text-red-700">{loadError}</p>
            <button
              type="button"
              onClick={() => setReloadKey((k) => k + 1)}
              className="text-xs font-bold text-red-700 border border-red-300 rounded-md px-2 py-1 hover:bg-red-100 cursor-pointer"
            >
              Retry
            </button>
          </div>
        )}

        {/* Top 3 Info Cards */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-4 mb-6">
          {isLoading ? (
            Array.from({ length: 3 }).map((_, index) => (
              <div key={index} className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm" aria-hidden="true">
                <SkeletonBlock className="h-3 w-24 rounded" />
                <SkeletonBlock className="mt-3 h-4 w-32 rounded" />
                <SkeletonBlock className="mt-2 h-3 w-24 rounded" />
              </div>
            ))
          ) : (
            <>
          {/* Store Status Card */}
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Store Status
            </p>
            <div className="flex items-center gap-2">
              <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isStoreOpen ? 'bg-emerald-500' : 'bg-rose-500'}`} />
              <p className="text-sm font-bold text-gray-900">
                {isStoreOpen ? 'Store Open' : 'Store Closed'}
              </p>
            </div>
            <p className="text-xs text-emerald-600 font-medium mt-1">
              {isStoreOpen ? 'Your store is visible to customers.' : 'Your store is hidden from customers.'}
            </p>
          </div>

          {/* Last Edit Card */}
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Last Edit
            </p>
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-gray-400 flex-shrink-0">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
              <div>
                <p className="text-sm font-bold text-gray-900">{lastEdit}</p>
                <p className="text-xs text-gray-400 font-medium">{lastEditBy}</p>
              </div>
            </div>
          </div>

          {/* Banner Section Card */}
          <div className="bg-white rounded-xl p-4 border border-gray-100 shadow-sm">
            <p className="text-2xs font-semibold text-gray-400 uppercase tracking-wider mb-1">
              Banner Section
            </p>
            <div className="flex items-center gap-2">
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="1.8" className="w-4 h-4 text-gray-400 flex-shrink-0">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
              <div>
                <p className="text-sm font-bold text-gray-900">{bannerCount}</p>
                <p className="text-xs text-gray-400 font-medium">{bannerType}</p>
              </div>
            </div>
          </div>
            </>
          )}
        </div>

        {/* Two-Column Layout */}
        <div className="flex flex-col lg:flex-row gap-6 items-start">
          {/* LEFT: Hero Banner & Slideshow */}
          <div className="flex-1 min-w-0 bg-white rounded-xl border border-gray-100 shadow-sm overflow-hidden">
            {/* Section Header */}
            <div className="flex items-center justify-between px-6 py-4 border-b border-gray-100">
              <div>
                <h2 className="text-base font-bold text-gray-900">Hero Banner &amp; Slideshow</h2>
                <p className="text-xs text-gray-400 mt-0.5">
                  Edit the main banner and slideshow images shown on your storefront.
                </p>
              </div>
              <div className="flex items-center gap-2 flex-shrink-0">
                <button
                  type="button"
                  onClick={() => setShowPreviewDrawer(true)}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-800 font-semibold text-xs rounded-lg shadow-sm transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-brand-orange">
                    <path d="M1 12s4-8 11-8 11 8 11 8-4 8-11 8-11-8-11-8z" />
                    <circle cx="12" cy="12" r="3" />
                  </svg>
                  <span>Preview</span>
                </button>
                <button
                  type="button"
                  onClick={handleAddNewSlide}
                  className="flex items-center gap-1.5 px-3.5 py-2 bg-white border border-gray-200 hover:bg-gray-50 text-gray-800 font-semibold text-xs rounded-lg shadow-sm transition-colors"
                >
                  <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 text-brand-orange">
                    <line x1="12" y1="5" x2="12" y2="19" />
                    <line x1="5" y1="12" x2="19" y2="12" />
                  </svg>
                  <span>Add New Slide</span>
                </button>
              </div>
            </div>

            {/* Hidden picker shared by every slide's Replace button */}
            <input
              ref={replaceInputRef}
              type="file"
              accept="image/png,image/jpeg,image/webp"
              onChange={handleReplaceImageChange}
              className="hidden"
            />

            {/* Slide Rows */}
            <div className="divide-y divide-gray-100">
              {isLoading ? (
                Array.from({ length: 3 }).map((_, index) => (
                  <div key={index} className="flex items-center gap-3 px-4 py-4" aria-hidden="true">
                    <SkeletonBlock className="h-4 w-4 rounded-sm" />
                    <SkeletonBlock className="h-14 w-20 shrink-0 rounded-lg" />
                    <SkeletonBlock className="h-5 w-14 shrink-0 rounded-full" />
                    <div className="min-w-0 flex-1 space-y-2">
                      <SkeletonBlock className="h-3 w-2/3 rounded" />
                      <SkeletonBlock className="h-3 w-1/2 rounded" />
                    </div>
                    <SkeletonBlock className="h-8 w-16 shrink-0 rounded-lg" />
                  </div>
                ))
              ) : slides.map((slide, idx) => {
                const isEditing = editingSlideId === slide.id
                return (
                  <div
                    key={slide.id}
                    className={`px-4 py-3 transition-colors ${
                      draggingSlideId === slide.id
                        ? 'opacity-50'
                        : dropTargetSlideId === slide.id
                          ? 'bg-orange-50'
                          : ''
                    }`}
                    onDragOver={(event) => {
                      event.preventDefault()
                      if (draggingSlideId !== slide.id) setDropTargetSlideId(slide.id)
                    }}
                    onDrop={(event) => handleSlideDrop(event, slide.id)}
                  >
                    {/* Main Row */}
                    <div className="flex items-center gap-3">
                      {/* Drag Handle */}
                      <button
                        type="button"
                        draggable
                        aria-label={`Drag to reorder slide ${idx + 1}`}
                        title="Drag to reorder"
                        onDragStart={(event) => {
                          event.dataTransfer.effectAllowed = 'move'
                          event.dataTransfer.setData('text/plain', slide.id)
                          setDraggingSlideId(slide.id)
                        }}
                        onDragEnd={() => {
                          setDraggingSlideId(null)
                          setDropTargetSlideId(null)
                        }}
                        className="flex flex-col gap-0.5 text-gray-300 flex-shrink-0 cursor-grab active:cursor-grabbing hover:text-gray-500 focus-visible:outline focus-visible:outline-2 focus-visible:outline-brand-orange"
                      >
                        <svg viewBox="0 0 24 24" fill="currentColor" className="w-4 h-4">
                          <circle cx="9" cy="7" r="1.2" />
                          <circle cx="15" cy="7" r="1.2" />
                          <circle cx="9" cy="12" r="1.2" />
                          <circle cx="15" cy="12" r="1.2" />
                          <circle cx="9" cy="17" r="1.2" />
                          <circle cx="15" cy="17" r="1.2" />
                        </svg>
                      </button>

                      {/* Thumbnail */}
                      <div className="w-20 h-14 rounded-lg overflow-hidden flex-shrink-0 border border-gray-100 bg-gray-50">
                        <img
                          src={getImageUrl(slide.imagePreview)}
                          alt={slide.title}
                          className="w-full h-full object-cover"
                        />
                      </div>

                      {/* Slide Label Badge */}
                      <div className="flex-shrink-0">
                        <span className="inline-block bg-blue-50 text-blue-600 text-2xs font-bold px-2 py-0.5 rounded-full">
                          Slide {idx + 1}
                        </span>
                      </div>

                      {/* Title & Subtitle */}
                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-2xs font-semibold text-gray-400 flex-shrink-0">Title</span>
                          <span className="text-xs font-semibold text-gray-800 truncate">{slide.title}</span>
                        </div>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className="text-2xs font-semibold text-gray-400 flex-shrink-0">Subtitle</span>
                          <span className="text-xs text-gray-500 truncate">{slide.subtext}</span>
                        </div>
                      </div>

                      {/* Actions */}
                      <div className="flex items-center gap-1.5 flex-shrink-0">
                        {/* Edit */}
                        <button
                          type="button"
                          onClick={() => setEditingSlideId(isEditing ? null : slide.id)}
                          className="flex items-center gap-1 px-2.5 py-1.5 text-xs font-semibold text-gray-600 hover:text-gray-900 border border-gray-200 hover:border-gray-300 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          <span>Edit</span>
                        </button>

                        {/* Delete */}
                        <button
                          type="button"
                          onClick={() => handleDeleteSlide(slide.id)}
                          className="p-1.5 text-gray-400 hover:text-rose-500 border border-gray-200 hover:border-rose-200 rounded-lg bg-white hover:bg-rose-50 transition-colors"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </button>

                        {/* Expand / Chevron */}
                        <button
                          type="button"
                          onClick={() => setEditingSlideId(isEditing ? null : slide.id)}
                          className="p-1.5 text-gray-400 hover:text-gray-700 border border-gray-200 rounded-lg bg-white hover:bg-gray-50 transition-colors"
                        >
                          <svg
                            viewBox="0 0 24 24"
                            fill="none"
                            stroke="currentColor"
                            strokeWidth="2.5"
                            className={`w-3.5 h-3.5 transform transition-transform ${isEditing ? 'rotate-180' : ''}`}
                          >
                            <polyline points="6 9 12 15 18 9" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {/* Expanded Edit Form */}
                    {isEditing && (
                      <div className="mt-4 pt-4 border-t border-gray-100 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">Title</label>
                            <input
                              type="text"
                              value={slide.title}
                              onChange={(e) => handleSlideChange(slide.id, 'title', e.target.value)}
                              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-orange focus:bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">Subtitle</label>
                            <input
                              type="text"
                              value={slide.subtext}
                              onChange={(e) => handleSlideChange(slide.id, 'subtext', e.target.value)}
                              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-orange focus:bg-white"
                            />
                          </div>
                        </div>
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">CTA Label</label>
                            <input
                              type="text"
                              value={slide.ctaLabel}
                              onChange={(e) => handleSlideChange(slide.id, 'ctaLabel', e.target.value)}
                              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-orange focus:bg-white"
                            />
                          </div>
                          <div>
                            <label className="block text-xs font-bold text-gray-700 mb-1">CTA Link</label>
                            <input
                              type="text"
                              value={slide.ctaLink}
                              onChange={(e) => handleSlideChange(slide.id, 'ctaLink', e.target.value)}
                              className="w-full p-2.5 bg-gray-50 border border-gray-200 rounded-lg text-xs font-semibold focus:outline-none focus:ring-2 focus:ring-brand-orange focus:bg-white"
                            />
                          </div>
                        </div>
                        {/* Banner Image */}
                        <div>
                          <label className="block text-xs font-bold text-gray-700 mb-1">Banner Image</label>
                          <div className="flex items-center gap-3 p-3 bg-gray-50 border border-gray-200 rounded-lg">
                            <img
                              src={getImageUrl(slide.imagePreview)}
                              alt="Slide preview"
                              className="w-14 h-10 rounded-lg object-cover border border-gray-200 flex-shrink-0"
                            />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-bold text-gray-800 truncate">{slide.bannerImage}</p>
                              <p className="text-2xs text-gray-400">Recommended: 1200×500 JPG/PNG</p>
                            </div>
                            <button
                              type="button"
                              disabled={uploadingSlideId === slide.id}
                              onClick={() => handleReplaceImageClick(slide.id)}
                              className="px-3 py-1.5 bg-white border border-gray-200 hover:bg-gray-100 rounded-lg text-xs font-bold text-gray-700 flex-shrink-0 transition-colors disabled:opacity-50 disabled:cursor-not-allowed"
                            >
                              {uploadingSlideId === slide.id ? 'Uploading…' : 'Replace'}
                            </button>
                          </div>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {!isLoading && slides.length === 0 && (
                <div className="px-6 py-10 text-center">
                  <p className="text-sm text-gray-400 font-medium">No slides yet. Add a new slide to get started.</p>
                </div>
              )}
            </div>
          </div>

          {/* RIGHT: Sidebar */}
          <div className="w-full lg:w-64 flex-shrink-0 space-y-4">
            {/* How to Edit Card */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-4">How to Edit</h3>
              <ol className="space-y-3.5">
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-brand-orange text-white text-2xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">1</span>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Click{' '}
                    <span className="inline-flex items-center gap-0.5 bg-gray-100 border border-gray-200 rounded px-1 py-0.5 font-semibold text-gray-700">
                      <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-2.5 h-2.5">
                        <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                        <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                      </svg>
                      Edit
                    </span>{' '}
                    on a slide to change its image, text, or action button.
                  </p>
                </li>
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-brand-orange text-white text-2xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">2</span>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Click{' '}
                    <span className="inline-flex items-center gap-0.5 bg-gray-100 border border-gray-200 rounded px-1 py-0.5 font-semibold text-gray-700">
                      + Add New Slide
                    </span>{' '}
                    to include more slides in your slideshow.
                  </p>
                </li>
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-brand-orange text-white text-2xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">3</span>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Hold the{' '}
                    <span className="inline-flex items-center bg-gray-100 border border-gray-200 rounded px-1 py-0.5 font-semibold text-gray-700">
                      six-dot handle
                    </span>{' '}
                    at the left of a slide and drag it to its new position.
                  </p>
                </li>
                <li className="flex gap-3">
                  <span className="w-5 h-5 rounded-full bg-brand-orange text-white text-2xs font-black flex items-center justify-center flex-shrink-0 mt-0.5">4</span>
                  <p className="text-xs text-gray-600 leading-relaxed">
                    Click{' '}
                    <span className="bg-gray-100 border border-gray-200 rounded px-1 py-0.5 font-semibold text-gray-700">
                      Save Changes
                    </span>{' '}
                    at the bottom to apply your updates.
                  </p>
                </li>
              </ol>
            </div>

            {/* Store Status Card */}
            <div className="bg-white rounded-xl border border-gray-100 shadow-sm p-5">
              <h3 className="text-sm font-bold text-gray-900 mb-3">Store Status</h3>
              <div className="flex items-center gap-2 mb-1.5">
                <span className={`w-2.5 h-2.5 rounded-full flex-shrink-0 ${isStoreOpen ? 'bg-emerald-500' : 'bg-rose-500'}`} />
                <p className="text-sm font-bold text-gray-900">
                  {isStoreOpen ? 'Store Open' : 'Store Closed'}
                </p>
              </div>
              <p className="text-2xs text-gray-500 leading-relaxed ml-4">
                Your store is currently visible to customers. You can update your banners and content anytime. Changes will go live immediately after saving.
              </p>
              <div className="mt-3 ml-4 p-2.5 bg-blue-50 border border-blue-100 rounded-lg flex gap-2">
                <span className="w-4 h-4 rounded-full bg-blue-500 text-white text-[8px] font-black flex items-center justify-center flex-shrink-0 mt-0.5">i</span>
                <p className="text-2xs text-blue-700 leading-relaxed">
                  To take your store offline, contact your administrator.
                </p>
              </div>
            </div>
          </div>
        </div>

        {/* Sticky Bottom Bar */}
        <div className={`fixed bottom-0 right-0 ${embedded ? 'left-0 md:left-72' : 'left-0 md:left-60'} bg-white/95 backdrop-blur-md border-t border-gray-200 px-6 py-3.5 flex items-center justify-between gap-4 z-20 shadow-lg`}>
          <div className="flex items-center gap-2">
            <span
              className={`w-2 h-2 rounded-full ${
                hasUnsavedChanges ? 'bg-amber-500 animate-pulse' : 'bg-emerald-500'
              }`}
            />
            <span className="text-xs font-semibold text-gray-600">
              {isLoading
                ? 'Loading…'
                : isSaving
                ? 'Saving…'
                : hasUnsavedChanges
                ? 'Unsaved changes'
                : 'All changes published'}
            </span>
          </div>

          <div className="flex items-center gap-2.5">
            <button
              type="button"
              disabled={!hasUnsavedChanges || isLoading}
              onClick={handleDiscard}
              className="px-4 py-2 bg-white border border-gray-200 hover:bg-gray-50 disabled:opacity-40 text-gray-700 font-semibold text-xs rounded-lg transition-colors"
            >
              Discard
            </button>
            <button
              type="button"
              disabled={isLoading || isSaving}
              onClick={handleSaveChanges}
              className="px-4 py-2 bg-brand-orange hover:bg-brand-orange-dark text-white font-bold text-xs rounded-lg transition-colors shadow-sm disabled:opacity-50 disabled:cursor-not-allowed"
            >
              {isSaving ? 'Saving…' : 'Save Changes'}
            </button>
          </div>
        </div>

        {/* Toast Confirmation */}
        {isSavedToast && (
          <div className="fixed bottom-20 right-8 bg-white text-gray-800 border border-gray-200 text-xs font-bold py-2.5 px-4 rounded-xl flex items-center gap-2 shadow-lg z-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-emerald-500">
              <polyline points="20 6 9 17 4 12" />
            </svg>
            <span>Changes saved successfully!</span>
          </div>
        )}
      </div>

      {/* Live Store Preview Drawer */}
      <DrawerPanel
        isOpen={showPreviewDrawer}
        onClose={() => setShowPreviewDrawer(false)}
        title="Live Storefront Preview"
        subtitle="Real-time preview of Tindahan ni Isko"
        width="max-w-md"
      >
        <div className="space-y-4">
          {previewSlide && (
            <div className="relative h-60 overflow-hidden rounded-xl border border-slate-200 bg-slate-900 text-white">
              {previewImage && (
                <img
                  src={previewImage}
                  alt=""
                  className="absolute inset-0 z-0 h-full w-full object-cover object-center"
                />
              )}
              <div className="absolute inset-0 z-10 bg-gradient-to-r from-black/70 via-black/20 to-transparent opacity-35" />
              <div className="relative z-20 flex h-full flex-col justify-end p-5 sm:p-6">
                <div className="max-w-xl">
                  <div className="mb-2 flex flex-wrap items-center gap-2">
                    {previewSlide.isLimitedStock ? (
                      <span className="inline-block rounded-md bg-red-600 px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
                        Limited Stock
                      </span>
                    ) : (
                      <span className="inline-block rounded-md bg-brand-orange px-2.5 py-1 text-[10px] font-semibold uppercase tracking-wider text-white">
                        {previewSlide.pillText}
                      </span>
                    )}
                    <span className="inline-block rounded-md bg-white/90 px-2.5 py-1 text-[10px] font-semibold text-slate-900 backdrop-blur-xs">
                      {previewSlide.subtext}
                    </span>
                  </div>
                  <h3 className="mb-3 text-2xl font-semibold leading-tight">
                    {previewSlide.title}
                  </h3>
                  <button
                    type="button"
                    className="inline-flex h-8 items-center justify-center rounded-md bg-brand-orange px-4 text-xs font-semibold text-white"
                  >
                    <span>{previewSlide.ctaLabel}</span>
                  </button>
                </div>
              </div>
            </div>
          )}
        </div>
      </DrawerPanel>
    </>
  )

  return embedded ? content : <AdminLayout>{content}</AdminLayout>
}
