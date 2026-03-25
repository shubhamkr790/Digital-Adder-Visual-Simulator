import { useState, useEffect } from 'react'
import { Menu, ChevronDown, X, Cpu } from 'lucide-react'

interface HeroProps { onLaunch: () => void }

export default function Hero({ onLaunch }: HeroProps) {
  const [menuOpen, setMenuOpen] = useState(false)
  useEffect(() => {
    document.body.style.overflow = menuOpen ? 'hidden' : 'auto'
  }, [menuOpen])

  return (
    <div className="relative min-h-screen w-full font-sans bg-black">
      {/* Video Background */}
      <video autoPlay loop muted playsInline
        className="absolute inset-0 w-full h-full object-cover z-0 opacity-80">
        <source src="https://d8j0ntlcm91z4.cloudfront.net/user_38xzZboKViGWJOttwIXH07lWA1P/hf_20260210_031346_d87182fb-b0af-4273-84d1-c6fd17d6bf0f.mp4" type="video/mp4" />
      </video>

      {/* Navbar */}
      <nav className="absolute top-0 left-0 w-full z-20 px-6 lg:px-[120px] py-4 flex items-center justify-between">
        <div className="flex items-center gap-2">
          <Cpu className="w-7 h-7 text-white" />
          <span className="text-white font-manrope font-bold text-lg tracking-tight">LogicForge</span>
        </div>
        <div className="hidden md:flex items-center gap-8">
          {['Home', 'Simulation', 'Quantum', 'Docs'].map(l => (
            <a key={l} href="#" className="font-manrope font-medium text-[14px] text-white hover:opacity-70 transition-opacity flex items-center gap-1">
              {l}{l === 'Simulation' && <ChevronDown className="w-3 h-3 opacity-60" />}
            </a>
          ))}
        </div>
        <button className="md:hidden text-white" onClick={() => setMenuOpen(true)}>
          <Menu className="w-6 h-6" />
        </button>
      </nav>

      {/* Mobile Menu */}
      {menuOpen && (
        <div className="fixed inset-0 bg-black z-50 flex flex-col p-6">
          <div className="flex justify-between items-center mb-10">
            <span className="text-white font-manrope font-bold text-xl">LogicForge</span>
            <button onClick={() => setMenuOpen(false)} className="text-white"><X className="w-7 h-7" /></button>
          </div>
          <div className="flex flex-col gap-6 flex-grow">
            {['Home', 'Simulation', 'Quantum', 'Docs'].map(l => (
              <a key={l} href="#" className="font-manrope text-xl text-white">{l}</a>
            ))}
          </div>
          <button onClick={() => { setMenuOpen(false); onLaunch(); }}
            className="w-full bg-[#7b39fc] rounded-[10px] text-white font-cabin font-medium text-[16px] py-3.5 mb-8">
            Launch Simulator
          </button>
        </div>
      )}

      {/* Hero Content */}
      <div className="relative z-10 flex items-center justify-center min-h-screen px-4">
        <div className="flex flex-col items-center text-center mt-24 max-w-[900px]">
          {/* Tagline Pill */}

          {/* Headline */}
          <h1 style={{ fontFamily: "'Instrument Serif', serif" }}
            className="text-white text-5xl md:text-[84px] leading-[1.05] mb-6 tracking-tight">
            Visualize digital logic <i style={{ fontFamily: "'Instrument Serif', serif", fontStyle: 'italic' }}>instantly</i> and effortlessly
          </h1>

          {/* Subtext */}
          <p className="font-inter font-normal text-[18px] text-white/70 max-w-[640px] mb-10 leading-relaxed">
            Interactive gate-level simulation with animated signal propagation, ripple vs lookahead comparison, and quantum adder visualization.
          </p>

          {/* CTAs */}
          <div className="flex flex-col sm:flex-row items-center gap-4">
            <button onClick={onLaunch}
              className="w-full sm:w-auto bg-[#7b39fc] hover:bg-[#8a4bfd] transition-all rounded-[10px] text-white font-cabin font-medium text-[16px] px-9 py-3.5 shadow-lg shadow-purple-900/40">
              Launch Simulator
            </button>
            <button
              className="w-full sm:w-auto bg-[#2b2344] hover:bg-[#362b55] transition-all rounded-[10px] text-[#f6f7f9] font-cabin font-medium text-[16px] px-9 py-3.5">
              Explore Quantum
            </button>
          </div>
        </div>
      </div>
    </div>
  )
}
