import { useState } from 'react'
import Hero from './Hero'
import SimulatorPage from './SimulatorPage'

export default function App() {
  const [view, setView] = useState<'hero' | 'simulator'>('hero')
  return view === 'hero'
    ? <Hero onLaunch={() => setView('simulator')} />
    : <SimulatorPage onBack={() => setView('hero')} />
}
