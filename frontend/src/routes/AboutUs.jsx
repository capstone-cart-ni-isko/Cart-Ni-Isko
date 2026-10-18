import { useEffect, useRef, useState } from 'react'
import FocusedLayout from '../components/layout/FocusedLayout.jsx'
import logoArt from '../assets/Branding/Copy of Tindahan ni Isko Logo (Transparent).png'
import badgeArt from '../assets/Branding/Copy of badge.png'
import capArt from '../assets/Branding/Copy of cap.png'
import jacketArt from '../assets/Branding/Copy of jacket.png'
import lanyardArt from '../assets/Branding/Copy of lanyard.png'
import shirtArt from '../assets/Branding/Copy of shirt.png'
import storeArt from '../assets/Branding/Copy of store.png'
import era2011Image from '../assets/Images/unnamed (2).jpg'
import era2025Image from '../assets/Images/unnamed (3).jpg'
import era2023Image from '../assets/Images/unnamed (4).jpg'
import era2021Image from '../assets/Images/unnamed (5).jpg'

/*
    The customer-facing "About Us" page opened from the home page.
    A centered logo leads the page, with the store's merchandise artwork
    used as subtle background accents. The history is shown as prominently
    displayed years: hovering or tapping a year reveals that era's story
    and photograph. FocusedLayout keeps the ribbon and bottom nav
    out (system rule 65) with a back button top left (system rules 68
    and 69).
*/

// Each era of the store's history, in order, with the image it needs.
const ERAS = [
  {
    years: '2011–2012',
    period: 'Academic Year 2011–2012',
    title: 'The First Spark — Wearing University Pride',
    image: era2011Image,
    imageAlt: 'BU Labels founding era, AY 2011–2012',
    body: (
      <>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-[var(--muted)]">
          BU Labels traces its roots to Academic Year 2011–2012, when the idea of wearing and
          expressing university pride first took form. Inspired by the culture of university
          identity observed in other institutions,{' '}
          <strong className="font-semibold text-slate-900 dark:text-[var(--ink)]">Jason Carmona</strong>{' '}
          (USC Internal Vice Chairperson), together with{' '}
          <strong className="font-semibold text-slate-900 dark:text-[var(--ink)]">Patrixia Sherly Santos</strong>{' '}
          (USC External Vice Chairperson) and{' '}
          <strong className="font-semibold text-slate-900 dark:text-[var(--ink)]">Carmel Joy Llabore</strong>{' '}
          (USC Finance Officer), conceptualized a clothing line that would allow BUe&ntilde;os to
          visibly represent their university.
        </p>
      </>
    ),
  },
  {
    years: '2021–2023',
    period: 'Academic Years 2021–2023',
    title: 'Structuring the Platform — HIBLANG BUEÑO and the Rise of Tindahan ni Isko',
    image: era2021Image,
    imageAlt: 'HIBLANG BUEÑO and the three components, AY 2021–2023',
    body: (
      <>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-[var(--muted)]">
          A significant phase of institutional structuring occurred under{' '}
          <strong className="font-semibold text-slate-900 dark:text-[var(--ink)]">Ryan Basanta</strong>,
          who served as USC Business Manager for two consecutive terms (AY 2021–2022 and
          AY 2022–2023). During his stewardship, BU Labels was formally organized into
          interconnected components that defined its operational identity:
        </p>
        <ul className="mt-3 space-y-1.5 border-l-2 border-slate-200 pl-3.5 dark:border-[var(--line)]">
          <li className="text-sm leading-relaxed text-slate-600 dark:text-[var(--muted)]">
            <strong className="font-semibold text-slate-900 dark:text-[var(--ink)]">HIBLANG BUEÑO</strong> — the
            design and creative branding of BU Labels
          </li>
          <li className="text-sm leading-relaxed text-slate-600 dark:text-[var(--muted)]">
            <strong className="font-semibold text-slate-900 dark:text-[var(--ink)]">AGAPAY BUe&ntilde;o</strong> — the
            extension arm focused on student welfare and assistance
          </li>
          <li className="text-sm leading-relaxed text-slate-600 dark:text-[var(--muted)]">
            <strong className="font-semibold text-slate-900 dark:text-[var(--ink)]">TINDAHAN NI ISKO</strong> — the
            merchandising platform
          </li>
        </ul>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-[var(--muted)]">
          In AY 2021–2022, <strong className="font-semibold text-slate-900 dark:text-[var(--ink)]">BU Labels 2021:
          HIBLANG BUEÑO</strong> marked the formal reintroduction of BU Labels with a strong
          advocacy-driven direction. Merchandise sales directly supported Agapay BUe&ntilde;o,
          reinforcing the idea that student fashion could be a vehicle for care, service, and
          solidarity.
        </p>
      </>
    ),
  },
  {
    years: '2023–2025',
    period: 'Academic Years 2023–2025',
    title: 'Seasons of Change and Celestial Rebirth',
    image: era2023Image,
    imageAlt: 'Seasons and BUnique rebrandings, AY 2023–2025',
    body: (
      <>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-[var(--muted)]">
          As leadership transitioned, BU Labels entered a period of creative reinterpretation,
          where each Business Manager introduced a distinct thematic rebranding while maintaining
          the platform&rsquo;s core purpose.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-[var(--muted)]">
          Under <strong className="font-semibold text-slate-900 dark:text-[var(--ink)]">Kurt Angelo Mejorada</strong>{' '}
          (AY 2023–2024), <strong className="font-semibold text-slate-900 dark:text-[var(--ink)]">BU Labels 2023:
          Seasons</strong> explored change and adaptability. Drawing inspiration from nature&rsquo;s
          cycles, this rebranding framed BU Labels as a living platform—capable of shifting
          aesthetics and narratives while remaining rooted in student identity. The &ldquo;Seasons&rdquo;
          concept served as a creative bridge between earlier advocacy-driven designs and future
          transformations.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-[var(--muted)]">
          In AY 2024–2025, <strong className="font-semibold text-slate-900 dark:text-[var(--ink)]">Izel Manata</strong>{' '}
          introduced <strong className="font-semibold text-slate-900 dark:text-[var(--ink)]">BU Labels 2025:
          BUnique</strong>, a cosmic-themed rebranding that symbolized renewal and return. Framed
          as a celestial rebirth, #BUnique positioned BU Labels as rediscovering its place after
          periods of dormancy and challenge. This era emphasized individuality within
          collectivity—inviting BUe&ntilde;os to see themselves as distinct yet connected parts of a
          larger whole.
        </p>
      </>
    ),
  },
  {
    years: '2025–Present',
    period: 'Academic Year 2025–Present',
    title: 'Realignment and Continuity — From BU Labels to Tindahan ni Isko',
    image: era2025Image,
    imageAlt: 'Tindahan ni Isko as the operational face, AY 2025–Present',
    body: (
      <>
        <p className="text-sm leading-relaxed text-slate-600 dark:text-[var(--muted)]">
          As BU Labels progressed through different administrations, operational
          challenges emerged—highlighting the need for clearer systems, consistent governance,
          and reaffirmed jurisdiction. These realities prompted a phase of realignment, where the
          focus shifted toward restoring operational clarity and responsibility.
        </p>
        <p className="mt-3 text-sm leading-relaxed text-slate-600 dark:text-[var(--muted)]">
          In AY 2025–2026, under USC Business Manager{' '}
          <strong className="font-semibold text-slate-900 dark:text-[var(--ink)]">Lorenz Sayson</strong>, the
          platform entered a rebranding transition that emphasized continuing the legacy that
          leaders started from the beginning. While earlier eras focused on advocacy, seasons, and
          cosmic renewal, this phase signals a movement toward refinement and consolidation,
          strengthening Tindahan ni Isko as the operational face of the enterprise while honoring
          the legacy of BU Labels.
        </p>
      </>
    ),
  },
]

// Fades an element in once it scrolls into view, and keeps it visible after.
function useReveal() {
  const ref = useRef(null)
  const [shown, setShown] = useState(false)

  useEffect(() => {
    const node = ref.current
    if (!node) return undefined
    if (!('IntersectionObserver' in window)) {
      setShown(true)
      return undefined
    }
    const observer = new IntersectionObserver(
      (entries) => {
        if (entries.some((entry) => entry.isIntersecting)) {
          setShown(true)
          observer.disconnect()
        }
      },
      { threshold: 0.1 },
    )
    observer.observe(node)
    return () => observer.disconnect()
  }, [])

  return [ref, shown]
}

// Fades a block in as it scrolls onto the screen.
function Reveal({ children, className = '' }) {
  const [ref, shown] = useReveal()
  return (
    <div
      ref={ref}
      className={`transition-all duration-700 ease-out ${shown ? 'translate-y-0 opacity-100' : 'translate-y-6 opacity-0'} ${className}`}
    >
      {children}
    </div>
  )
}

function AboutUs({ backTo = '/home' }) {
  // The hovered (or tapped) year drives which era is shown below it.
  const [activeEra, setActiveEra] = useState(0)
  const era = ERAS[activeEra]

  return (
    <FocusedLayout
      title="About Us"
      subtitle="The history and background of Tindahan ni Isko"
      backTo={backTo}
      containerClassName="max-w-none"
    >
      <div className="animate-fade-in w-full pb-16">
        {/* ── HERO: the store logo leads the page, framed by subtle merchandise artwork ── */}
        <section className="relative -mx-4 overflow-hidden md:-mx-6 lg:-mx-8">
          <div/>

          {/* Merchandise cutouts framing the hero (desktop only) */}
          <img src={shirtArt} alt="" aria-hidden="true" className="pointer-events-none absolute left-[5%] top-[16%] hidden w-24 -rotate-12 select-none opacity-[0.15] md:block lg:w-32 dark:opacity-25" />
          <img src={capArt} alt="" aria-hidden="true" className="pointer-events-none absolute right-[6%] top-[10%] hidden w-24 rotate-12 select-none opacity-[0.15] md:block lg:w-28 dark:opacity-25" />
          <img src={jacketArt} alt="" aria-hidden="true" className="pointer-events-none absolute bottom-[8%] left-[8%] hidden w-24 rotate-6 select-none opacity-[0.12] md:block lg:w-28 dark:opacity-20" />
          <img src={lanyardArt} alt="" aria-hidden="true" className="pointer-events-none absolute bottom-[12%] right-[7%] hidden w-20 -rotate-6 select-none opacity-[0.12] md:block lg:w-24 dark:opacity-20" />

          <div className="relative px-10 py-18 text-center md:py-20">
            <div className="relative mx-auto w-fit">
              <img src={logoArt} alt="Tindahan ni Isko" className="mx-auto h-25 w-auto select-none md:h-35 lg:h-40" />
            </div>
            <p className="mt-7 text-[11px] font-medium uppercase tracking-[0.1em] text-slate-400 dark:text-[var(--muted)]">
              Bicol University &ndash; USC Official Merchandise
            </p>
            <h1 className="mx-auto mt-3 max-w-2xl text-2xl font-bold tracking-tight text-slate-900 md:text-4xl dark:text-[var(--ink)]">
              More than merchandise, a student institution in motion.
            </h1>
            <p className="mx-auto mt-5 max-w-2xl text-sm leading-relaxed text-slate-600 md:text-base dark:text-[var(--muted)]">
              What began in AY 2011&ndash;2012 as BU Labels&mdash;a simple idea that lets BUe&ntilde;os
              wear their university pride&mdash;has grown through advocacy, creativity, and renewal
              into the official student-led merchandise platform of the Bicol University &ndash;
              University Student Council.
            </p>
          </div>
        </section>

        {/* ── OUR PURPOSE: mission, vision, and student stewardship ── */}
        <Reveal className="mt-14">
          <div className="text-center">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-orange">Our purpose</span>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-[var(--ink)] md:text-3xl">
              Mission &amp; Vision
            </h2>
          </div>

          <div className="mx-auto mt-8 grid max-w-4xl gap-8 border-t border-slate-200 pt-8 sm:grid-cols-2 sm:gap-12 dark:border-[var(--line)]">
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-orange">Mission</h3>
              <p className="mt-3 text-lg font-medium leading-relaxed text-slate-700 md:text-xl dark:text-[var(--ink-2)]">
                To provide accessible, high-quality official merchandise that strengthens
                university pride while supporting sustainable student initiatives.
              </p>
            </div>
            <div>
              <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-orange">Vision</h3>
              <p className="mt-3 text-lg font-medium leading-relaxed text-slate-700 md:text-xl dark:text-[var(--ink-2)]">
                To be the recognized student-led merchandise brand that represents the identity,
                values, and unity of every Iskolar ng Bayan.
              </p>
            </div>
          </div>

          <div className="mx-auto mt-8 max-w-4xl border-t border-slate-200 pt-8 text-center dark:border-[var(--line)]">
            <h3 className="text-[11px] font-semibold uppercase tracking-[0.2em] text-brand-orange">
              By the Students, For the Students
            </h3>
            <p className="mx-auto mt-3 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-[var(--muted)]">
              Tindahan ni Isko operates under the official authority of the Bicol University &ndash;
              University Student Council and the Office of the BU USC Business Manager.
            </p>
            <p className="mx-auto mt-2 max-w-2xl text-sm leading-relaxed text-slate-600 dark:text-[var(--muted)]">
              We are committed to the highest standards of financial accountability and
              transparency. Our operations strictly follow university policies on student
              enterprises, ensuring that our growth as a brand always translates into better
              service for the student body.
            </p>
          </div>
        </Reveal>

        {/* ── OUR HISTORY: prominent years; hovering or tapping a year reveals its era ── */}
        <Reveal className="mt-14">
          <div className="text-center">
            <span className="text-[11px] font-semibold uppercase tracking-[0.1em] text-brand-orange">Our history</span>
            <h2 className="mt-2 text-2xl font-bold tracking-tight text-slate-900 dark:text-[var(--ink)] md:text-3xl">
              Four eras, one continuous legacy
            </h2>
            <p className="mx-auto mt-2 max-w-2xl text-sm text-slate-600 dark:text-[var(--muted)]">
              From a spark of university pride to the student-led enterprise of today. Hover or tap
              a year to read its story.
            </p>
          </div>

          <div className="mt-8 grid grid-cols-2 gap-px border-y border-slate-200 bg-slate-200 md:grid-cols-4 dark:border-[var(--line)] dark:bg-[var(--line)]">
            {ERAS.map((item, index) => {
              const isActive = index === activeEra
              return (
                <button
                  key={item.title}
                  type="button"
                  onMouseEnter={() => setActiveEra(index)}
                  onFocus={() => setActiveEra(index)}
                  onClick={() => setActiveEra(index)}
                  aria-pressed={isActive}
                  className={`cursor-pointer bg-[#F8F9FA] px-4 py-7 text-center transition-colors dark:bg-[var(--surface)] ${
                    isActive ? 'text-brand-orange' : 'text-slate-400 hover:text-slate-700 dark:text-[var(--muted)] dark:hover:text-[var(--ink)]'
                  }`}
                >
                  
                  <span className="mt-1.5 block text-xl font-bold tracking-tight md:text-3xl">{item.years}</span>
                  <span
                    aria-hidden="true"
                    className={`mx-auto mt-3 block h-0.5 w-10 transition-opacity ${
                      isActive ? 'bg-brand-orange opacity-100' : 'opacity-0'
                    }`}
                  />
                </button>
              )
            })}
          </div>

          <div
            key={activeEra}
            className="mx-auto mt-10 grid max-w-5xl animate-fade-in items-start gap-8 md:grid-cols-2 md:gap-12"
          >
            <div>
              <p className="text-[11px] font-semibold uppercase tracking-[0.25em] text-brand-orange">{era.period}</p>
              <h3 className="mt-2 text-xl font-bold leading-snug tracking-tight text-slate-900 md:text-2xl dark:text-[var(--ink)]">
                {era.title}
              </h3>
              <div className="mt-4">{era.body}</div>
            </div>
            <img
              src={era.image}
              alt={era.imageAlt}
              loading="lazy"
              className="w-full rounded-2xl border border-slate-200 shadow-sm dark:border-[var(--line)]"
            />
          </div>
        </Reveal>

        {/* ── Closing statement ── */}
        <Reveal className="mt-14">
          <div className="relative overflow-hidden rounded-2xl bg-slate-900 p-6 md:p-10 dark:bg-[var(--surface-2)]">
            <img src={badgeArt} alt="" aria-hidden="true" className="pointer-events-none absolute -left-6 -top-6 w-24 -rotate-12 select-none opacity-[0.12] md:w-32 dark:opacity-25" />
            <img src={storeArt} alt="" aria-hidden="true" className="pointer-events-none absolute -bottom-6 -right-4 w-24 rotate-6 select-none opacity-[0.12] md:w-32 dark:opacity-25" />
            <p className="relative text-[11px] font-semibold uppercase tracking-[0.3em] text-white/50 dark:text-[var(--muted)]">
              The story continues
            </p>
            <p className="relative mt-4 text-sm leading-relaxed text-slate-300 dark:text-[var(--muted)]">
              The evolution of BU Labels and Tindahan ni Isko is a collective story—shaped by
              student leaders who sparked the idea, Business Managers who structured and rebranded
              it, artists who renewed its spaces, and students who gave it meaning through
              participation. Each rebranding—from HIBLANG BUEÑO, to Seasons, to BUnique, and
              beyond—thus reflects a response to its time.
            </p>
            <p className="relative mt-4 text-base font-semibold leading-relaxed text-white md:text-lg dark:text-[var(--ink)]">
              More than a brand, BU Labels and Tindahan ni Isko remain a student institution in
              motion—defined not by one era alone, but by continuity, service, and shared
              responsibility to the BUe&ntilde;o community.
            </p>
          </div>
        </Reveal>


      </div>
    </FocusedLayout>
  )
}

export default AboutUs
