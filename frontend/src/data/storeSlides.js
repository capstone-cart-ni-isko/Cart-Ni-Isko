const DEFAULT_STORE_SLIDES = [
  {
    id: 'slide-1',
    title: 'New BUnique Collection',
    pillText: 'Pre-order Now',
    subtext: 'Until August 20',
    ctaLabel: 'Shop the Collection',
    ctaLink: '/shop?collection=BUnique Collection',
    isLimitedStock: false,
    bannerImage: '/src/assets/Images/unnamed (1).jpg',
    imagePreview: '/src/assets/Images/unnamed (1).jpg',
  },
  {
    id: 'slide-2',
    title: 'Iskolar Pride Varsity',
    pillText: 'Limited Stock',
    subtext: 'Official BU Varsity Edition',
    ctaLabel: 'Shop Jackets',
    ctaLink: '/shop?category=Jackets',
    isLimitedStock: true,
    bannerImage: '/src/assets/Images/unnamed (51).png',
    imagePreview: '/src/assets/Images/unnamed (51).png',
  },
  {
    id: 'slide-3',
    title: 'BU Polo Classics',
    pillText: 'Best Sellers',
    subtext: 'Back in stock',
    ctaLabel: 'Shop Classics',
    ctaLink: '/shop?category=Shirts',
    isLimitedStock: false,
    bannerImage: '/src/assets/Images/unnamed (52).jpg',
    imagePreview: '/src/assets/Images/unnamed (52).jpg',
  },
]

export { DEFAULT_STORE_SLIDES }

export function parseStoreSlides(raw) {
  if (typeof raw !== 'string' || !raw) return null

  try {
    const parsed = JSON.parse(raw)
    if (!Array.isArray(parsed)) return null

    return parsed
      .filter((slide) => slide && typeof slide === 'object' && !Array.isArray(slide))
      .map((slide, index) => {
        const fallback = DEFAULT_STORE_SLIDES[index % DEFAULT_STORE_SLIDES.length]
        const image = [slide.imagePreview, slide.image, slide.bannerImage]
          .find((candidate) => typeof candidate === 'string' && candidate.trim())
          || fallback.bannerImage

        return {
          ...fallback,
          ...slide,
          id: ['string', 'number'].includes(typeof slide.id) ? slide.id : `slide-${index + 1}`,
          title: typeof slide.title === 'string' ? slide.title : fallback.title,
          pillText: typeof slide.pillText === 'string' ? slide.pillText : fallback.pillText,
          subtext: typeof slide.subtext === 'string'
            ? slide.subtext
            : typeof slide.subtitle === 'string'
              ? slide.subtitle
              : fallback.subtext,
          ctaLabel: typeof slide.ctaLabel === 'string'
            ? slide.ctaLabel
            : typeof slide.ctaText === 'string'
              ? slide.ctaText
              : fallback.ctaLabel,
          ctaLink: typeof slide.ctaLink === 'string' ? slide.ctaLink : fallback.ctaLink,
          isLimitedStock: typeof slide.isLimitedStock === 'boolean'
            ? slide.isLimitedStock
            : fallback.isLimitedStock,
          bannerImage: image,
          imagePreview: image,
        }
      })
  } catch {
    return null
  }
}
