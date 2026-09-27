import { useState, useEffect } from 'react'
import { useAdmin } from '../../hooks/useAdmin.js'
import { useToast } from '../../hooks/useToast.js'
import AdminLayout from '../../components/admin/AdminLayout.jsx'
import DrawerPanel from '../../components/admin/DrawerPanel.jsx'
import StatusPill from '../../components/admin/StatusPill.jsx'
import Panel from '../../components/admin/kit/Panel.jsx'
import KpiCard from '../../components/admin/kit/KpiCard.jsx'
import AdminPageHeader from '../../components/admin/kit/AdminPageHeader.jsx'
import { BTN_PRIMARY_SM, BTN_SECONDARY_SM, ICON_BTN, INPUT, LABEL, SCROLL_FADE, PAGE_ROOT } from '../../components/admin/kit/ui.js'
import { getImageUrl } from '../../utils/imageUtils.js'
import { fetchSettings, updateSettings } from '../../services/settings.js'

/** Slides are persisted as a JSON string in settings.store_slides. */
function parseSlides(raw) {
  if (!raw) return []
  try {
    const parsed = JSON.parse(raw)
    return Array.isArray(parsed) ? parsed : []
  } catch {
    return []
  }
}

export default function AdminStoreCustomization() {
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
  const [isSavedToast, setIsSavedToast] = useState(false)
  const [hasUnsavedChanges, setHasUnsavedChanges] = useState(false)
  const [showPreviewDrawer, setShowPreviewDrawer] = useState(false)

  useEffect(() => {
    let cancelled = false
    setIsLoading(true)
    setLoadError('')
    fetchSettings()
      .then((s) => {
        if (cancelled) return
        const data = s || {}
        setSettings(data)
        setSlides(parseSlides(data.store_slides))
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
  const lastEditBy = settings?.banner_last_edit_by ? `by ${settings.banner_last_edit_by}` : 'No edits recorded yet'
  const bannerCount = `${slides.length} image${slides.length === 1 ? '' : 's'}`
  const bannerType = 'Uploaded to the hero banner & slideshow'

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
      bannerImage: 'banner-new.jpg',
      imagePreview: '/src/assets/Images/unnamed (1).png',
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
    setSlides(parseSlides(settings?.store_slides))
    setHasUnsavedChanges(false)
    setEditingSlideId(null)
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

  const FIELD = `${INPUT} text-xs`
  const statusLabel = isLoading ? 'Loading…' : isSaving ? 'Saving…' : hasUnsavedChanges ? 'Unsaved changes' : 'All changes published'

  return (
    <AdminLayout>
      <div className={PAGE_ROOT}>
        <AdminPageHeader
          title="Store Customization"
          subtitle="Update your store's appearance and manage what customers see on the storefront."
        />

        {/* Load states */}
        {isLoading && (
          <div className="shrink-0 bg-isko-blue/5 border border-isko-blue/20 rounded-md px-3 py-2 text-xs font-medium text-slate-600 flex items-center gap-2">
            <span className="spinner-circle !w-3.5 !h-3.5" /> Loading store customization…
          </div>
        )}
        {loadError && (
          <div className="shrink-0 flex items-center justify-between gap-3 bg-rose-50 border border-rose-200 rounded-md px-3 py-2">
            <p className="text-xs font-semibold text-rose-700">{loadError}</p>
            <button type="button" onClick={() => setReloadKey((k) => k + 1)} className={BTN_SECONDARY_SM}>
              Retry
            </button>
          </div>
        )}

        {/* Status row */}
        <div className="grid grid-cols-1 sm:grid-cols-3 gap-3 shrink-0">
          <KpiCard
            label="Store status"
            value={isStoreOpen ? 'Open' : 'Closed'}
            subtext={isStoreOpen ? 'Visible to customers' : 'Hidden from customers'}
            accent={isStoreOpen ? 'blue' : 'orange'}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <path d="M3 9l9-7 9 7v11a2 2 0 0 1-2 2H5a2 2 0 0 1-2-2z" />
                <polyline points="9 22 9 12 15 12 15 22" />
              </svg>
            }
          />
          <KpiCard
            label="Last edit"
            value={lastEdit}
            subtext={lastEditBy}
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="4" width="18" height="18" rx="2" ry="2" />
                <line x1="16" y1="2" x2="16" y2="6" />
                <line x1="8" y1="2" x2="8" y2="6" />
                <line x1="3" y1="10" x2="21" y2="10" />
              </svg>
            }
          />
          <KpiCard
            label="Banner section"
            value={bannerCount}
            subtext={bannerType}
            accent="orange"
            icon={
              <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2">
                <rect x="3" y="3" width="18" height="18" rx="2" ry="2" />
                <circle cx="8.5" cy="8.5" r="1.5" />
                <polyline points="21 15 16 10 5 21" />
              </svg>
            }
          />
        </div>

        {/* Body: slide editor + help column, each scrolling inside */}
        <div className="grid grid-cols-1 lg:grid-cols-12 gap-3 lg:flex-1 lg:min-h-0">
          <Panel
            title="Hero banner & slideshow"
            meta="Main banner and slideshow images on the storefront"
            className="lg:col-span-8 min-h-[20rem] lg:min-h-0"
            actions={
              <button type="button" onClick={handleAddNewSlide} className={BTN_SECONDARY_SM}>
                <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5 text-isko-blue" aria-hidden="true">
                  <line x1="12" y1="5" x2="12" y2="19" />
                  <line x1="5" y1="12" x2="19" y2="12" />
                </svg>
                Add new slide
              </button>
            }
          >
            <div className={`h-full ${SCROLL_FADE} divide-y divide-slate-100`}>
              {slides.map((slide, idx) => {
                const isEditing = editingSlideId === slide.id
                return (
                  <div key={slide.id} className="py-3">
                    <div className="flex items-center gap-3">
                      <div className="w-20 h-14 rounded-md overflow-hidden shrink-0 border border-slate-200 bg-slate-50">
                        <img src={getImageUrl(slide.imagePreview)} alt={slide.title} className="w-full h-full object-cover" />
                      </div>

                      <span className="shrink-0 inline-block bg-isko-blue/10 text-isko-blue-dark text-[10px] font-semibold px-2 py-0.5 rounded-full">
                        Slide {idx + 1}
                      </span>

                      <div className="flex-1 min-w-0">
                        <div className="flex items-baseline gap-2">
                          <span className="text-[11px] font-medium text-slate-400 shrink-0">Title</span>
                          <span className="text-xs font-semibold text-slate-800 truncate">{slide.title}</span>
                        </div>
                        <div className="flex items-baseline gap-2 mt-0.5">
                          <span className="text-[11px] font-medium text-slate-400 shrink-0">Subtitle</span>
                          <span className="text-xs text-slate-500 truncate">{slide.subtext}</span>
                        </div>
                      </div>

                      <div className="flex items-center gap-1.5 shrink-0">
                        <button
                          type="button"
                          onClick={() => setEditingSlideId(isEditing ? null : slide.id)}
                          aria-expanded={isEditing}
                          className={BTN_SECONDARY_SM}
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5 text-isko-blue" aria-hidden="true">
                            <path d="M11 4H4a2 2 0 0 0-2 2v14a2 2 0 0 0 2 2h14a2 2 0 0 0 2-2v-7" />
                            <path d="M18.5 2.5a2.121 2.121 0 0 1 3 3L12 15l-4 1 1-4 9.5-9.5z" />
                          </svg>
                          {isEditing ? 'Done' : 'Edit'}
                        </button>
                        <button
                          type="button"
                          onClick={() => handleDeleteSlide(slide.id)}
                          aria-label={`Delete slide ${idx + 1}`}
                          className="h-8 w-8 flex items-center justify-center text-slate-400 hover:text-rose-600 border border-slate-200 hover:border-rose-200 rounded-md bg-white hover:bg-rose-50 transition-colors cursor-pointer"
                        >
                          <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2" className="w-3.5 h-3.5">
                            <polyline points="3 6 5 6 21 6" />
                            <path d="M19 6v14a2 2 0 0 1-2 2H7a2 2 0 0 1-2-2V6" />
                            <path d="M10 11v6" />
                            <path d="M14 11v6" />
                          </svg>
                        </button>
                      </div>
                    </div>

                    {isEditing && (
                      <div className="mt-3 pt-3 border-t border-slate-100 space-y-3">
                        <div className="grid grid-cols-1 sm:grid-cols-2 gap-3">
                          <div>
                            <label className={LABEL} htmlFor={`slide-title-${slide.id}`}>Title</label>
                            <input id={`slide-title-${slide.id}`} type="text" value={slide.title} onChange={(e) => handleSlideChange(slide.id, 'title', e.target.value)} className={FIELD} />
                          </div>
                          <div>
                            <label className={LABEL} htmlFor={`slide-sub-${slide.id}`}>Subtitle</label>
                            <input id={`slide-sub-${slide.id}`} type="text" value={slide.subtext} onChange={(e) => handleSlideChange(slide.id, 'subtext', e.target.value)} className={FIELD} />
                          </div>
                          <div>
                            <label className={LABEL} htmlFor={`slide-cta-${slide.id}`}>CTA label</label>
                            <input id={`slide-cta-${slide.id}`} type="text" value={slide.ctaLabel} onChange={(e) => handleSlideChange(slide.id, 'ctaLabel', e.target.value)} className={FIELD} />
                          </div>
                          <div>
                            <label className={LABEL} htmlFor={`slide-link-${slide.id}`}>CTA link</label>
                            <input id={`slide-link-${slide.id}`} type="text" value={slide.ctaLink} onChange={(e) => handleSlideChange(slide.id, 'ctaLink', e.target.value)} className={FIELD} />
                          </div>
                        </div>
                        <div>
                          <span className={LABEL}>Banner image</span>
                          <div className="flex items-center gap-3 p-2.5 bg-slate-50 border border-slate-200 rounded-md">
                            <img src={getImageUrl(slide.imagePreview)} alt="Slide preview" className="w-14 h-10 rounded object-cover border border-slate-200 shrink-0" />
                            <div className="flex-1 min-w-0">
                              <p className="text-xs font-semibold text-slate-800 truncate">{slide.bannerImage}</p>
                              <p className="text-[11px] text-slate-400">Recommended: 1200×500 JPG/PNG</p>
                            </div>
                          </div>
                        </div>
                        <div className="flex items-center gap-2">
                          <span className="text-[11px] font-medium text-slate-500">Reorder</span>
                          <button type="button" disabled={idx === 0} onClick={() => handleMoveSlide(idx, -1)} aria-label="Move slide up" className={ICON_BTN}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                              <polyline points="18 15 12 9 6 15" />
                            </svg>
                          </button>
                          <button type="button" disabled={idx === slides.length - 1} onClick={() => handleMoveSlide(idx, 1)} aria-label="Move slide down" className={ICON_BTN}>
                            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-3.5 h-3.5">
                              <polyline points="6 9 12 15 18 9" />
                            </svg>
                          </button>
                        </div>
                      </div>
                    )}
                  </div>
                )
              })}

              {isLoading ? (
                <div className="py-10 text-center flex items-center justify-center gap-2">
                  <span className="spinner-circle !w-3.5 !h-3.5" />
                  <p className="text-xs text-slate-400">Loading slides…</p>
                </div>
              ) : (
                slides.length === 0 && (
                  <div className="py-10 text-center text-xs text-slate-400">No slides yet. Add a new slide to get started.</div>
                )
              )}
            </div>
          </Panel>

          <div className="lg:col-span-4 flex flex-col gap-3 lg:min-h-0">
            <Panel title="How to edit" className="lg:flex-1 lg:min-h-0">
              <ol className={`h-full ${SCROLL_FADE} space-y-3`}>
                {[
                  <>Click <b className="font-semibold text-slate-800">Edit</b> on a slide to change its image, title or subtitle.</>,
                  <>Click <b className="font-semibold text-slate-800">Add new slide</b> to include more slides in the slideshow.</>,
                  <>Open a slide and use the <b className="font-semibold text-slate-800">Reorder</b> arrows to change the slide order.</>,
                  <>Click <b className="font-semibold text-slate-800">Save changes</b> below to publish your updates.</>,
                ].map((step, i) => (
                  <li key={i} className="flex gap-2.5">
                    <span className="w-5 h-5 rounded-full bg-isko-orange text-white text-[10px] font-bold flex items-center justify-center shrink-0">{i + 1}</span>
                    <p className="text-xs text-slate-600 leading-relaxed">{step}</p>
                  </li>
                ))}
              </ol>
            </Panel>

            <Panel title="Store status" className="shrink-0">
              <StatusPill status={isStoreOpen ? 'Store open' : 'Store closed'} variant={isStoreOpen ? 'green' : 'red'} />
              <p className="text-[11px] text-slate-500 leading-relaxed mt-2">
                {isStoreOpen
                  ? 'Customers can see the storefront. Saved changes go live immediately.'
                  : 'The storefront is hidden from customers.'}{' '}
                To take the store offline or back online, contact your administrator.
              </p>
            </Panel>
          </div>
        </div>

        {/* Save bar: part of the page column, so it never covers content */}
        <div className="shrink-0 bg-white border border-slate-200 rounded-lg px-3 py-2 flex items-center justify-between gap-3">
          <div className="flex items-center gap-2 min-w-0">
            <span
              className={`w-2 h-2 rounded-full shrink-0 ${hasUnsavedChanges ? 'bg-isko-orange animate-pulse' : 'bg-emerald-500'}`}
              aria-hidden="true"
            />
            <span className="text-xs font-medium text-slate-600 truncate" role="status">{statusLabel}</span>
          </div>
          <div className="flex items-center gap-2">
            <button type="button" disabled={!hasUnsavedChanges || isLoading} onClick={handleDiscard} className={BTN_SECONDARY_SM}>
              Discard
            </button>
            <button type="button" disabled={isLoading || isSaving} onClick={handleSaveChanges} className={BTN_PRIMARY_SM}>
              {isSaving ? 'Saving…' : 'Save changes'}
            </button>
          </div>
        </div>

        {/* Toast Confirmation */}
        {isSavedToast && (
          <div className="fixed bottom-20 right-8 bg-white text-slate-800 border border-slate-200 text-xs font-semibold py-2.5 px-4 rounded-lg flex items-center gap-2 shadow-lg z-50">
            <svg viewBox="0 0 24 24" fill="none" stroke="currentColor" strokeWidth="2.5" className="w-4 h-4 text-isko-blue">
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
          {slides.length > 0 && (
            <div className="rounded-xl overflow-hidden bg-slate-900 relative h-48 border border-slate-200 text-white p-4 flex flex-col justify-end">
              <div
                className="absolute inset-0 bg-cover bg-center opacity-60"
                style={{ backgroundImage: `url(${getImageUrl(slides[0].imagePreview)})` }}
              />
              <div className="absolute inset-0 bg-gradient-to-t from-black/80 via-black/30 to-transparent" />
              <div className="relative z-10 space-y-1">
                <span className="inline-block bg-isko-orange text-white text-[9px] font-bold uppercase px-2 py-0.5 rounded-md">
                  {slides[0].subtext}
                </span>
                <h3 className="text-xl font-black">{slides[0].title}</h3>
                <button type="button" className="mt-2 inline-flex items-center gap-1 px-3 py-1 bg-white text-gray-900 text-xs font-black rounded-lg">
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
