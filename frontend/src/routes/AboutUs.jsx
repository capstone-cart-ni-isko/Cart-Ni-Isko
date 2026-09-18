import { Link } from 'react-router-dom'
import AppShell from '../components/layout/AppShell.jsx'
import logo from '../assets/icons/brand/Tindahan ni Isko Logo (Transparent).svg'

function AboutUs() {
  return (
    <AppShell>
      <div className="max-w-[1200px] mx-auto px-4 md:px-6 py-6 md:py-10 animate-fade-in space-y-12 pb-24 md:pb-16">
        {/* Breadcrumb */}
        <nav className="flex items-center gap-2 text-xs font-semibold text-gray-500">
          <Link to="/home" className="hover:text-brand-orange transition-colors">Home</Link>
          <span>/</span>
          <span className="text-gray-800">About Us</span>
        </nav>

        {/* Hero Section */}
        <section className="relative overflow-hidden rounded-3xl bg-slate-900 text-white shadow-xl">
          <div className="absolute inset-0 opacity-10 select-none pointer-events-none flex items-center justify-center">
            <span className="text-[16rem] font-black tracking-widest text-white rotate-6">BU</span>
          </div>
          <div className="relative z-10 p-8 md:p-14 lg:p-16 max-w-3xl space-y-5">
            <div className="inline-flex items-center gap-2 px-3.5 py-1.5 rounded-full bg-brand-orange/20 border border-brand-orange/40 text-brand-orange text-xs font-black tracking-wider uppercase">
              Official BU-USC Initiative
            </div>
            <h1 className="text-3xl md:text-5xl lg:text-6xl font-black leading-tight tracking-tight">
              More than merchandise. <br />
              <span className="text-brand-orange">It's BU pride you can wear.</span>
            </h1>
            <p className="text-gray-300 text-base md:text-lg leading-relaxed font-medium">
              Tindahan ni Isko is the official merchandise line of the Bicol University–University Student Council, created to celebrate university identity, empower student innovators, and serve the BUeño community.
            </p>
          </div>
        </section>

        {/* 1. About Tindahan ni Isko & 2. Connection to Bicol University */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8 items-stretch">
          <div className="bg-white rounded-3xl p-8 md:p-10 border border-gray-100 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-orange-50 border border-orange-200 flex items-center justify-center text-brand-orange text-xl font-bold">
                01
              </div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">About Tindahan ni Isko</h2>
              <p className="text-gray-600 leading-relaxed text-sm md:text-base font-normal">
                Born out of the aspiration to unite students through university pride, <strong>Tindahan ni Isko</strong> is more than just a retail store. It serves as a creative and economic student hub where university culture and modern design intersect.
              </p>
              <p className="text-gray-600 leading-relaxed text-sm md:text-base font-normal">
                Every hoodie, shirt, jacket, and accessory is conceptualized with the Iskolar ng Bayan in mind—blending everyday functionality, durable comfort, and bold collegiate aesthetics.
              </p>
            </div>
            <div className="pt-6 border-t border-gray-100 mt-6 flex items-center gap-4">
              <img src={logo} alt="Tindahan ni Isko" className="h-10 object-contain" />
              <div>
                <p className="text-xs font-bold text-gray-900">Student-Led & University-Inspired</p>
                <p className="text-xs text-gray-500">Established to celebrate the BUeño heritage</p>
              </div>
            </div>
          </div>

          <div className="bg-white rounded-3xl p-8 md:p-10 border border-gray-100 shadow-sm flex flex-col justify-between">
            <div className="space-y-4">
              <div className="w-12 h-12 rounded-2xl bg-blue-50 border border-blue-200 flex items-center justify-center text-blue-800 text-xl font-bold">
                02
              </div>
              <h2 className="text-2xl font-black text-gray-900 tracking-tight">Our Connection to Bicol University</h2>
              <p className="text-gray-600 leading-relaxed text-sm md:text-base font-normal">
                Tindahan ni Isko operates in proud association with the <strong>Bicol University – University Student Council (BU-USC)</strong>. Unlike third-party resellers or generic campus vendors, our collections are officially sanctioned, ensuring university branding standards and institutional pride.
              </p>
              <p className="text-gray-600 leading-relaxed text-sm md:text-base font-normal">
                Proceeds directly support student council programs, student development activities, welfare initiatives, and leadership projects across Bicol University campuses.
              </p>
            </div>
            <div className="pt-6 border-t border-gray-100 mt-6 bg-slate-50 p-4 rounded-2xl">
              <p className="text-xs font-bold text-gray-800">Direct Student Reinvestment</p>
              <p className="text-xs text-gray-500">Every purchase helps fund university student initiatives.</p>
            </div>
          </div>
        </section>

        {/* 3. Our Purpose & 4. Our Brand / Identity */}
        <section className="bg-white rounded-3xl p-8 md:p-12 border border-gray-100 shadow-sm space-y-8">
          <div className="max-w-2xl">
            <span className="text-xs font-black uppercase text-brand-orange tracking-widest">Philosophy & Character</span>
            <h2 className="text-3xl font-black text-gray-900 tracking-tight mt-1">Our Purpose & Brand Identity</h2>
          </div>

          <div className="grid grid-cols-1 md:grid-cols-3 gap-6">
            <div className="p-6 rounded-2xl bg-gray-50 border border-gray-100 space-y-3">
              <h3 className="text-lg font-black text-gray-900">Why "Tindahan ni Isko"?</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                "Tindahan" represents warmth, community, and everyday accessibility. "Isko" embodies the resilience, intellect, and patriotic spirit of every BUeño Iskolar ng Bayan.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-gray-50 border border-gray-100 space-y-3">
              <h3 className="text-lg font-black text-gray-900">Sparks of Wisdom</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Inspired by the university colors—Navy Blue and BU Orange—our designs capture both academic excellence and modern streetwear expression.
              </p>
            </div>

            <div className="p-6 rounded-2xl bg-gray-50 border border-gray-100 space-y-3">
              <h3 className="text-lg font-black text-gray-900">Unified Identity</h3>
              <p className="text-sm text-gray-600 leading-relaxed">
                Whether you're attending class, cheering in sports matches, representing BU in regional competitions, or graduating, our merchandise connects us all.
              </p>
            </div>
          </div>
        </section>

        {/* 5. Our Mission & Vision */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="rounded-3xl bg-brand-orange text-white p-8 md:p-10 shadow-lg space-y-4">
            <span className="text-xs font-black tracking-widest uppercase bg-white/20 px-3 py-1 rounded-full">Our Direction</span>
            <h3 className="text-2xl md:text-3xl font-black">Our Mission</h3>
            <p className="text-white/95 leading-relaxed text-sm md:text-base">
              To deliver premium-quality, accessible, and authentically designed merchandise that instills campus spirit, champions student creativity, and gives back sustainably to the student body of Bicol University.
            </p>
          </div>

          <div className="rounded-3xl bg-slate-900 text-white p-8 md:p-10 shadow-lg space-y-4">
            <span className="text-xs font-black tracking-widest uppercase bg-white/20 px-3 py-1 rounded-full">Our Horizon</span>
            <h3 className="text-2xl md:text-3xl font-black">Our Vision</h3>
            <p className="text-slate-300 leading-relaxed text-sm md:text-base">
              To be the premier collegiate lifestyle brand in the Bicol Region, recognized for innovative student entrepreneurship, ethical production, and unwavering devotion to university pride.
            </p>
          </div>
        </section>

        {/* 6. Our Community & 7. Sustainability / Impact */}
        <section className="grid grid-cols-1 md:grid-cols-2 gap-8">
          <div className="bg-white rounded-3xl p-8 md:p-10 border border-gray-100 shadow-sm space-y-4">
            <div className="w-10 h-10 rounded-xl bg-orange-100 text-brand-orange flex items-center justify-center font-black">
              🤝
            </div>
            <h3 className="text-xl font-black text-gray-900">Our Community</h3>
            <p className="text-gray-600 text-sm md:text-base leading-relaxed">
              We proudly serve the vibrant communities across all Bicol University campuses:
            </p>
            <ul className="text-sm text-gray-600 space-y-2 list-disc list-inside">
              <li>Main Campus (Legazpi City)</li>
              <li>Daraga Campus</li>
              <li>Polangui Campus</li>
              <li>Guinobatan Campus</li>
              <li>Tabaco Campus & Gubat Campus</li>
              <li>BU Alumni worldwide, faculty, and university staff</li>
            </ul>
          </div>

          <div className="bg-white rounded-3xl p-8 md:p-10 border border-gray-100 shadow-sm space-y-4">
            <div className="w-10 h-10 rounded-xl bg-emerald-100 text-emerald-600 flex items-center justify-center font-black">
              🌱
            </div>
            <h3 className="text-xl font-black text-gray-900">Sustainability & Impact</h3>
            <p className="text-gray-600 text-sm md:text-base leading-relaxed">
              We practice intentional production through pre-orders and carefully planned inventory runs to minimize textile waste and excess manufacturing.
            </p>
            <p className="text-gray-600 text-sm md:text-base leading-relaxed">
              By working with local garment partners in Albay and Bicol, we champion regional craftsmanship while keeping prices fair and accessible for students.
            </p>
          </div>
        </section>

        {/* CTA to Shop */}
        <section className="rounded-3xl bg-gradient-to-r from-slate-900 via-slate-800 to-brand-orange-dark p-8 md:p-12 text-white flex flex-col md:flex-row items-center justify-between gap-6 shadow-xl">
          <div className="space-y-2 text-center md:text-left">
            <h3 className="text-2xl md:text-3xl font-black">Ready to represent BU?</h3>
            <p className="text-gray-300 text-sm md:text-base">
              Explore the latest official hoodies, tees, varsity jackets, and campus essentials.
            </p>
          </div>
          <Link
            to="/shop"
            className="px-8 py-4 bg-brand-orange hover:bg-brand-orange-light text-white font-black text-sm rounded-2xl shadow-lg transition-transform active:scale-95 shrink-0"
          >
            Explore BU Merchandise →
          </Link>
        </section>
      </div>
    </AppShell>
  )
}

export default AboutUs
