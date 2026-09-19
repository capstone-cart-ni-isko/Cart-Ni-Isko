import { Link } from 'react-router-dom'
import AppShell from '../components/layout/AppShell.jsx'
import logo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'
import { UsersGroupIcon, LeafIcon } from '../components/ui/Icons.jsx'

function AboutUs() {
  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-6 md:py-8 animate-fade-in space-y-8 pb-24 md:pb-16">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs font-semibold text-slate-500">
          <Link to="/home" className="hover:text-brand-orange transition-colors">Home</Link>
          <span>/</span>
          <span className="text-slate-800">About Us</span>
        </nav>

        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-lg bg-white border border-slate-200 text-slate-900">
          <div className="absolute inset-0 opacity-5 select-none pointer-events-none flex items-center justify-center">
            <span className="text-[14rem] font-black tracking-widest text-slate-900 rotate-6">BU</span>
          </div>
          <div className="relative z-10 p-6 md:p-10 max-w-3xl space-y-4">
            <div className="inline-flex items-center gap-2 px-2.5 py-1 rounded-md bg-orange-50 border border-orange-200 text-brand-orange text-xs font-bold tracking-wider uppercase">
              Official BU-USC Initiative
            </div>
            <h1 className="text-2xl md:text-4xl lg:text-5xl font-extrabold leading-tight tracking-tight">
              More than merchandise. <br />
              <span className="text-brand-orange">It's BU pride you can wear.</span>
            </h1>
            <p className="text-slate-600 text-sm md:text-base leading-relaxed">
              Tindahan ni Isko is the official merchandise line of the Bicol University–University Student Council, created to celebrate university identity, empower student innovators, and serve the BUeño community.
            </p>
          </div>
        </section>

        {/* 1. About Tindahan ni Isko & 2. Connection to Bicol University */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6 items-stretch">
          <div className="bg-white rounded-lg p-6 md:p-8 border border-slate-200 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-8 h-8 rounded-md bg-orange-50 border border-orange-200 flex items-center justify-center text-brand-orange text-sm font-bold">
                01
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">About Tindahan ni Isko</h2>
              <p className="text-slate-600 leading-relaxed text-sm">
                Born out of the aspiration to unite students through university pride, <strong>Tindahan ni Isko</strong> is more than just a retail store. It serves as a creative and economic student hub where university culture and modern design intersect.
              </p>
              <p className="text-slate-600 leading-relaxed text-sm">
                Every hoodie, shirt, jacket, and accessory is conceptualized with the Iskolar ng Bayan in mind—blending everyday functionality, durable comfort, and bold collegiate aesthetics.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-200 mt-6 flex items-center gap-3">
              <img src={logo} alt="Tindahan ni Isko" className="h-8 object-contain" />
              <div>
                <p className="text-xs font-bold text-slate-900">Student-Led & University-Inspired</p>
                <p className="text-xs text-slate-500">Established to celebrate the BUeño heritage</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-lg p-6 md:p-8 border border-slate-200 flex flex-col justify-between">
            <div className="space-y-3">
              <div className="w-8 h-8 rounded-md bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-800 text-sm font-bold">
                02
              </div>
              <h2 className="text-xl font-extrabold text-slate-900 tracking-tight">Our Connection to Bicol University</h2>
              <p className="text-slate-600 leading-relaxed text-sm">
                Tindahan ni Isko operates in proud association with the <strong>Bicol University – University Student Council (BU-USC)</strong>. Unlike third-party resellers or generic campus vendors, our collections are officially sanctioned, ensuring university branding standards and institutional pride.
              </p>
              <p className="text-slate-600 leading-relaxed text-sm">
                Proceeds directly support student council programs, student development activities, welfare initiatives, and leadership projects across Bicol University campuses.
              </p>
            </div>
            <div className="pt-4 border-t border-slate-200 mt-6 bg-slate-50 p-3 rounded-md border border-slate-200">
              <p className="text-xs font-bold text-slate-800">Direct Student Reinvestment</p>
              <p className="text-xs text-slate-500">Every purchase helps fund university student initiatives.</p>
            </div>
          </div>
        </section>

        {/* 3. Our Purpose & 4. Our Brand / Identity */}
        <section className="bg-white rounded-lg p-6 md:p-8 border border-slate-200 space-y-6">
          <div className="max-w-2xl">
            <span className="text-xs font-bold uppercase text-brand-orange tracking-wider">Philosophy & Character</span>
            <h2 className="text-2xl font-extrabold text-slate-900 tracking-tight mt-1">Our Purpose & Brand Identity</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-4">
            <div className="p-4 rounded-md bg-slate-50 border border-slate-200 space-y-2">
              <h3 className="text-base font-bold text-slate-900">Why "Tindahan ni Isko"?</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                "Tindahan" represents warmth, community, and everyday accessibility. "Isko" embodies the resilience, intellect, and patriotic spirit of every BUeño Iskolar ng Bayan.
              </p>
            </div>

            <div className="p-4 rounded-md bg-slate-50 border border-slate-200 space-y-2">
              <h3 className="text-base font-bold text-slate-900">Sparks of Wisdom</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Inspired by the university colors—Navy Blue and BU Orange—our designs capture both academic excellence and modern streetwear expression.
              </p>
            </div>

            <div className="p-4 rounded-md bg-slate-50 border border-slate-200 space-y-2">
              <h3 className="text-base font-bold text-slate-900">Unified Identity</h3>
              <p className="text-xs text-slate-600 leading-relaxed">
                Whether you're attending class, cheering in sports matches, representing BU in regional competitions, or graduating, our merchandise connects us all.
              </p>
            </div>
          </div>
        </section>

        {/* 5. Our Mission & Vision */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="rounded-lg bg-orange-500 text-white p-6 md:p-8 space-y-3">
            <span className="text-xs font-bold tracking-wider uppercase bg-white/20 px-2.5 py-0.5 rounded-md inline-block">Our Direction</span>
            <h3 className="text-xl md:text-2xl font-extrabold">Our Mission</h3>
            <p className="text-white/95 leading-relaxed text-xs md:text-sm">
              To deliver premium-quality, accessible, and authentically designed merchandise that instills campus spirit, champions student creativity, and gives back sustainably to the student body of Bicol University.
            </p>
          </div>

          <div className="rounded-lg bg-slate-50 border border-slate-200 text-slate-900 p-6 md:p-8 space-y-3">
            <span className="text-xs font-bold tracking-wider uppercase bg-slate-200 text-slate-700 px-2.5 py-0.5 rounded-md inline-block">Our Horizon</span>
            <h3 className="text-xl md:text-2xl font-extrabold text-slate-900">Our Vision</h3>
            <p className="text-slate-600 leading-relaxed text-xs md:text-sm">
              To be the premier collegiate lifestyle brand in the Bicol Region, recognized for innovative student entrepreneurship, ethical production, and unwavering devotion to university pride.
            </p>
          </div>
        </section>

        {/* 6. Our Community & 7. Sustainability / Impact */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-6">
          <div className="bg-white rounded-lg p-6 md:p-8 border border-slate-200 space-y-3">
            <div className="w-8 h-8 rounded-md bg-orange-50 border border-orange-200 text-brand-orange flex items-center justify-center">
              <UsersGroupIcon className="w-4 h-4 text-brand-orange" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900">Our Community</h3>
            <p className="text-slate-600 text-xs md:text-sm leading-relaxed">
              We proudly serve the vibrant communities across all Bicol University campuses:
            </p>
            <ul className="text-xs md:text-sm text-slate-600 space-y-1.5 list-disc list-inside">
              <li>Main Campus (Legazpi City)</li>
              <li>Daraga Campus</li>
              <li>Polangui Campus</li>
              <li>Guinobatan Campus</li>
              <li>Tabaco Campus & Gubat Campus</li>
              <li>BU Alumni worldwide, faculty, and university staff</li>
            </ul>
          </div>

          <div className="bg-white rounded-lg p-6 md:p-8 border border-slate-200 space-y-3">
            <div className="w-8 h-8 rounded-md bg-emerald-50 border border-emerald-200 text-emerald-600 flex items-center justify-center">
              <LeafIcon className="w-4 h-4 text-emerald-600" />
            </div>
            <h3 className="text-lg font-extrabold text-slate-900">Sustainability & Impact</h3>
            <p className="text-slate-600 text-xs md:text-sm leading-relaxed">
              We practice intentional production through pre-orders and carefully planned inventory runs to minimize textile waste and excess manufacturing.
            </p>
            <p className="text-slate-600 text-xs md:text-sm leading-relaxed">
              By working with local garment partners in Albay and Bicol, we champion regional craftsmanship while keeping prices fair and accessible for students.
            </p>
          </div>
        </section>

        {/* CTA to Shop */}
        <section className="rounded-lg bg-slate-50 border border-slate-200 p-6 md:p-8 text-slate-900 flex flex-col md:flex-row items-center justify-between gap-4">
          <div className="space-y-1 text-center md:text-left">
            <h3 className="text-xl md:text-2xl font-extrabold text-slate-900">Ready to represent BU?</h3>
            <p className="text-slate-600 text-xs md:text-sm">
              Explore the latest official hoodies, tees, varsity jackets, and campus essentials.
            </p>
          </div>
          <Link
            to="/shop"
            className="h-8 px-4 bg-brand-orange hover:bg-brand-orange-dark text-white font-bold text-xs rounded-md transition-colors shrink-0 flex items-center justify-center cursor-pointer"
          >
            Explore BU Merchandise
          </Link>
        </section>
      </div>
    </AppShell>
  )
}

export default AboutUs
