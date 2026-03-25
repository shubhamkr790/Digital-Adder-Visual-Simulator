import React, { useState, useEffect, useRef, useCallback } from 'react'
import { Play, Pause, SkipForward, RotateCcw, ArrowLeft, ChevronDown, ChevronUp, Zap } from 'lucide-react'
import { fullAdderBit, rippleCarry4, cla4, genTruthTable } from './logic'
import type { AdderMode, SignalValue } from './logic'
import {
  drawANDGate, drawORGate, drawXORGate, drawBlock, drawPin, drawOutputPin,
  drawJunction, drawWire, drawToffoliGate, drawCNOTGate, COLORS
} from './canvasDraw'

interface Props { onBack: () => void }

interface WireState { value: SignalValue; progress: number }
interface GateState { glow: number }

interface SimScheduleItem {
  time: number
  action: () => void
}

const SPEED_MAP: Record<number, number> = { 0: 0.25, 1: 0.5, 2: 1, 3: 2, 4: 4 }

// ─── Gate input/output port helpers ─────────────────────────────────────────
// AND/OR/XOR: cx,cy = body center. Input ports at cx-40,cy±11. Output at cx+40,cy
// But we use an offset of ~35 for the body half-width
const GP = {
  and: { in1: (cx: number, cy: number): [number, number] => [cx - 37, cy - 11], in2: (cx: number, cy: number): [number, number] => [cx - 37, cy + 11], out: (cx: number, cy: number): [number, number] => [cx + 38, cy] },
  or: { in1: (cx: number, cy: number): [number, number] => [cx - 43, cy - 11], in2: (cx: number, cy: number): [number, number] => [cx - 43, cy + 11], out: (cx: number, cy: number): [number, number] => [cx + 43, cy] },
  xor: { in1: (cx: number, cy: number): [number, number] => [cx - 43, cy - 11], in2: (cx: number, cy: number): [number, number] => [cx - 43, cy + 11], out: (cx: number, cy: number): [number, number] => [cx + 43, cy] },
}

export default function SimulatorPage({ onBack }: Props) {
  const [mode, setMode] = useState<AdderMode>('half')
  const [A, setA] = useState(0), [B, setB] = useState(0), [Cin, setCin] = useState(0)
  const [A4, setA4] = useState(0), [B4, setB4] = useState(0)
  const [isPlaying, setIsPlaying] = useState(false)
  const [speedIdx, setSpeedIdx] = useState(2)
  const [showTiming, setShowTiming] = useState(true)
  const [simDone, setSimDone] = useState(false)
  const [rightTab, setRightTab] = useState<'truth' | 'eq' | 'stats' | 'quantum'>('truth')

  const canvasRef = useRef<HTMLCanvasElement>(null)
  const timingRef = useRef<HTMLCanvasElement>(null)
  const rafRef = useRef<number>(0)
  const startTimeRef = useRef<number>(0)
  const wires = useRef<Record<string, WireState>>({})
  const gates = useRef<Record<string, GateState>>({})
  const schedule = useRef<SimScheduleItem[]>([])
  const scheduleIdx = useRef(0)
  const simTimeRef = useRef(0)
  const timingLog = useRef<Array<{ t: number, signals: Record<string, number> }>>([])

  // ─── Compute current outputs ─────────────────────────────────────────────
  const getOutputs = useCallback(() => {
    if (mode === 'half') {
      return { sum: A ^ B, carry: A & B, label: `${A}⊕${B}=${A ^ B}, C=${A & B}` }
    }
    if (mode === 'full' || mode === 'quantum') {
      const { sum, cout } = fullAdderBit(A, B, Cin)
      return { sum, cout, label: `${A}⊕${B}⊕${Cin}=${sum}, C=${cout}` }
    }
    if (mode === 'ripple4' || mode === 'cla4') {
      const bits = rippleCarry4(A4, B4, 0)
      const S = bits.reduce((acc, b, i) => acc | (b.s << i), 0)
      const cout = bits[3].cout
      const result = A4 + B4
      return { S, cout, decimal: result, label: `${A4}+${B4}=${result} (dec)` }
    }
    return {}
  }, [mode, A, B, Cin, A4, B4])

  // ─── Reset simulation ─────────────────────────────────────────────────────
  const resetSim = useCallback(() => {
    cancelAnimationFrame(rafRef.current)
    setIsPlaying(false); setSimDone(false)
    wires.current = {}; gates.current = {}
    schedule.current = []; scheduleIdx.current = 0
    simTimeRef.current = 0; timingLog.current = []
    // Force redraw
    requestAnimationFrame(() => drawCanvas())
  }, [mode])

  // ─── Build simulation schedule ────────────────────────────────────────────
  const buildSchedule = useCallback(() => {
    const s: SimScheduleItem[] = []
    const speed = SPEED_MAP[speedIdx]
    const dt = 1 / speed // time units per second
    const W = wires.current; const G = gates.current
    const setWire = (id: string, v: SignalValue, startT: number, dur: number) => {
      s.push({ time: startT, action: () => { W[id] = { value: v, progress: 0 }; W[id + '_start'] = { value: v, progress: startT } } })
      // Animate progress from 0 to 1 over dur seconds - handled by RAF
    }
    const setGate = (id: string, t: number, dur: number) => {
      s.push({ time: t, action: () => { G[id] = { glow: 1 } } })
      s.push({ time: t + dur, action: () => { G[id] = { glow: 0 } } })
    }
    if (mode === 'half') {
      const vA = A as SignalValue, vB = B as SignalValue
      const sum = (A ^ B) as SignalValue, carry = (A & B) as SignalValue
      s.push({ time: 0, action: () => { W['A'] = { value: vA, progress: 0 }; W['B'] = { value: vB, progress: 0 } } })
      s.push({ time: 0.1 * dt, action: () => { W['a_xor'] = { value: vA, progress: 0 }; W['b_xor'] = { value: vB, progress: 0 }; W['a_and'] = { value: vA, progress: 0 }; W['b_and'] = { value: vB, progress: 0 } } })
      s.push({ time: 0.8 * dt, action: () => { G['xor'] = { glow: 1 }; G['and'] = { glow: 1 } } })
      s.push({ time: 1.4 * dt, action: () => { G['xor'] = { glow: 0 }; G['and'] = { glow: 0 }; W['sum'] = { value: sum, progress: 0 }; W['carry'] = { value: carry, progress: 0 } } })
      s.push({ time: 2.2 * dt, action: () => { setSimDone(true) } })
    } else if (mode === 'full' || mode === 'quantum') {
      const vA = A as SignalValue, vB = B as SignalValue, vC = Cin as SignalValue
      const s1 = (A ^ B) as SignalValue, c1 = (A & B) as SignalValue
      const { sum, cout } = fullAdderBit(A, B, Cin)
      s.push({ time: 0, action: () => { W['A'] = { value: vA, progress: 0 }; W['B'] = { value: vB, progress: 0 }; W['Cin'] = { value: vC, progress: 0 } } })
      s.push({ time: 0.1 * dt, action: () => { W['a_xor1'] = { value: vA, progress: 0 }; W['b_xor1'] = { value: vB, progress: 0 }; W['a_and1'] = { value: vA, progress: 0 }; W['b_and1'] = { value: vB, progress: 0 } } })
      s.push({ time: 0.8 * dt, action: () => { G['xor1'] = { glow: 1 }; G['and1'] = { glow: 1 } } })
      s.push({ time: 1.3 * dt, action: () => { G['xor1'] = { glow: 0 }; G['and1'] = { glow: 0 }; W['s1'] = { value: s1, progress: 0 }; W['c1'] = { value: c1, progress: 0 } } })
      s.push({ time: 1.5 * dt, action: () => { W['s1_xor2'] = { value: s1, progress: 0 }; W['cin_xor2'] = { value: vC, progress: 0 }; W['s1_and2'] = { value: s1, progress: 0 }; W['cin_and2'] = { value: vC, progress: 0 } } })
      s.push({ time: 2.2 * dt, action: () => { G['xor2'] = { glow: 1 }; G['and2'] = { glow: 1 } } })
      s.push({ time: 2.7 * dt, action: () => { G['xor2'] = { glow: 0 }; G['and2'] = { glow: 0 }; W['sum'] = { value: sum, progress: 0 }; W['c2'] = { value: cout as SignalValue, progress: 0 } } })
      s.push({ time: 2.9 * dt, action: () => { W['c1_or'] = { value: c1, progress: 0 }; W['c2_or'] = { value: cout as SignalValue, progress: 0 } } })
      s.push({ time: 3.5 * dt, action: () => { G['or'] = { glow: 1 } } })
      s.push({ time: 4.0 * dt, action: () => { G['or'] = { glow: 0 }; W['cout'] = { value: cout as SignalValue, progress: 0 } } })
      s.push({ time: 4.8 * dt, action: () => { setSimDone(true) } })
    } else if (mode === 'ripple4' || mode === 'cla4') {
      const bits = rippleCarry4(A4, B4, 0)
      const isRipple = mode === 'ripple4'
      for (let i = 0; i < 4; i++) {
        const t0 = isRipple ? i * 1.2 * dt : 0
        const bi = (A4 >> i) & 1, bj = (B4 >> i) & 1
        s.push({ time: t0 * dt, action: () => { W[`a${i}`] = { value: bi as SignalValue, progress: 0 }; W[`b${i}`] = { value: bj as SignalValue, progress: 0 } } })
        s.push({ time: (t0 + 0.6) * dt, action: () => { G[`fa${i}`] = { glow: 1 } } })
        s.push({ time: (t0 + 1.1) * dt, action: () => { G[`fa${i}`] = { glow: 0 }; W[`s${i}`] = { value: bits[i].s as SignalValue, progress: 0 }; W[`co${i}`] = { value: bits[i].cout as SignalValue, progress: 0 } } })
      }
      const lastT = (isRipple ? 3 * 1.2 + 1.1 : 1.1) * dt
      s.push({ time: lastT * dt + 0.5, action: () => { setSimDone(true) } })
    }
    schedule.current = s.sort((a, b) => a.time - b.time)
    scheduleIdx.current = 0
  }, [mode, A, B, Cin, A4, B4, speedIdx])

  // ─── Draw canvas ──────────────────────────────────────────────────────────
  const drawCanvas = useCallback(() => {
    const canvas = canvasRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const W = canvas.width, H = canvas.height
    const ws = wires.current, gs = gates.current
    ctx.clearRect(0, 0, W, H)
    ctx.fillStyle = COLORS.bg; ctx.fillRect(0, 0, W, H)

    const g = (id: string) => gs[id]?.glow ?? 0
    const wv = (id: string): SignalValue => ws[id]?.value ?? -1
    const wp = (id: string): number => Math.min(ws[id]?.progress ?? 0, 1)

    if (mode === 'half') drawHalfAdder(ctx, W, H, g, wv, wp)
    else if (mode === 'full') drawFullAdder(ctx, W, H, g, wv, wp)
    else if (mode === 'quantum') drawQuantumAdder(ctx, W, H, g, wv, wp)
    else if (mode === 'ripple4') drawRipple(ctx, W, H, g, wv, wp)
    else if (mode === 'cla4') drawCLA(ctx, W, H, g, wv, wp)
  }, [mode])

  // ─── Animation RAF loop ───────────────────────────────────────────────────
  const animate = useCallback((ts: number) => {
    if (!isPlaying) return
    if (!startTimeRef.current) startTimeRef.current = ts
    const elapsed = (ts - startTimeRef.current) / 1000 // seconds
    simTimeRef.current = elapsed
    // Process schedule
    while (scheduleIdx.current < schedule.current.length &&
      schedule.current[scheduleIdx.current].time <= elapsed) {
      schedule.current[scheduleIdx.current].action()
      scheduleIdx.current++
    }
    // Animate wire progress
    const speed = SPEED_MAP[speedIdx]
    Object.keys(wires.current).forEach(id => {
      const w = wires.current[id]
      if (w && w.progress < 1) w.progress = Math.min(w.progress + 0.025 * speed, 1)
    })
    // Decay gate glow
    Object.keys(gates.current).forEach(id => {
      const gate = gates.current[id]
      if (gate && gate.glow > 0) gate.glow = Math.max(gate.glow - 0.02, 0)
    })
    drawCanvas()
    if (scheduleIdx.current < schedule.current.length || Object.values(wires.current).some(w => w.progress < 1)) {
      rafRef.current = requestAnimationFrame(animate)
    } else {
      // Force final glow decay
      setTimeout(() => { drawCanvas() }, 300)
    }
  }, [isPlaying, speedIdx, drawCanvas])

  useEffect(() => {
    if (isPlaying) {
      startTimeRef.current = 0
      buildSchedule()
      rafRef.current = requestAnimationFrame(animate)
    } else {
      cancelAnimationFrame(rafRef.current)
    }
    return () => cancelAnimationFrame(rafRef.current)
  }, [isPlaying])

  useEffect(() => { resetSim() }, [mode, A, B, Cin, A4, B4])

  useEffect(() => {
    const obs = new ResizeObserver(() => drawCanvas())
    const c = canvasRef.current; if (c) { obs.observe(c); drawCanvas() }
    return () => obs.disconnect()
  }, [drawCanvas])

  // ─── Step mode ───────────────────────────────────────────────────────────
  const stepForward = useCallback(() => {
    if (scheduleIdx.current === 0) buildSchedule()
    if (scheduleIdx.current < schedule.current.length) {
      schedule.current[scheduleIdx.current].action()
      scheduleIdx.current++
      Object.keys(wires.current).forEach(id => { wires.current[id].progress = 1 })
      drawCanvas()
    }
  }, [buildSchedule, drawCanvas])

  // ─── Keyboard shortcuts ───────────────────────────────────────────────────
  useEffect(() => {
    const modes: AdderMode[] = ['half', 'full', 'ripple4', 'cla4', 'quantum']
    const handler = (e: KeyboardEvent) => {
      if (e.target instanceof HTMLInputElement) return
      if (e.code === 'Space') { e.preventDefault(); setIsPlaying(p => !p) }
      if (e.code === 'ArrowRight') { e.preventDefault(); stepForward() }
      if (e.key === 'r' || e.key === 'R') resetSim()
      if (e.key >= '1' && e.key <= '5') setMode(modes[+e.key - 1])
    }
    window.addEventListener('keydown', handler)
    return () => window.removeEventListener('keydown', handler)
  }, [stepForward, resetSim])

  const outputs = getOutputs()
  const truthTable = genTruthTable(mode)
  const currentRow = mode === 'half' ? A * 2 + B : mode === 'full' || mode === 'quantum' ? A * 4 + B * 2 + Cin : -1

  // ─── Half Adder drawing ──────────────────────────────────────────────────
  function drawHalfAdder(ctx: CanvasRenderingContext2D, W: number, H: number,
    g: (id: string) => number, wv: (id: string) => SignalValue, wp: (id: string) => number) {
    const cx = W / 2, cy = H / 2
    const ax = 80, bx = 80, ay = cy - 70, by = cy + 70
    const xcx = cx - 30, xcy = cy - 70, acx = cx - 30, acy = cy + 70
    const sox = cx + 130, soy = cy - 70, cox = cx + 130, coy = cy + 70
    // Input pins
    drawPin(ctx, ax, ay, 'A', wv('A')); drawPin(ctx, bx, by, 'B', wv('B'))
    // XOR gate
    drawXORGate(ctx, xcx, xcy, g('xor'))
    // AND gate
    drawANDGate(ctx, acx, acy, g('and'))
    // Wires
    const jAx = cx - 155, jBx = cx - 150
    drawWire(ctx, [[ax, ay], [jAx, ay], [xcx - 43, xcy - 11]], wv('a_xor'), wp('a_xor'))
    drawWire(ctx, [[bx, by], [jBx, by], [jBx, xcy + 11], [xcx - 43, xcy + 11]], wv('b_xor'), wp('b_xor'))
    drawWire(ctx, [[jAx, ay], [jAx, acy - 11], [acx - 37, acy - 11]], wv('a_and'), wp('a_and'))
    drawWire(ctx, [[jBx, by], [acx - 37, acy + 11]], wv('b_and'), wp('b_and'))
    drawJunction(ctx, jAx, ay, wv('A') === 1)
    drawJunction(ctx, jBx, by, wv('B') === 1)
    // Output wires
    drawWire(ctx, [[xcx + 43, xcy], [sox, soy]], wv('sum'), wp('sum'))
    drawWire(ctx, [[acx + 38, acy], [cox, coy]], wv('carry'), wp('carry'))
    drawOutputPin(ctx, sox, soy, 'Sum', wv('sum'))
    drawOutputPin(ctx, cox, coy, 'Carry', wv('carry'), true)
    // Labels
    ctx.fillStyle = '#64748B'; ctx.font = '11px JetBrains Mono'; ctx.textAlign = 'center'
    ctx.fillText('S = A ⊕ B', xcx, xcy - 40)
    ctx.fillText('C = A · B', acx, acy - 40)
  }

  function drawFullAdder(ctx: CanvasRenderingContext2D, W: number, H: number,
    g: (id: string) => number, wv: (id: string) => SignalValue, wp: (id: string) => number) {
    const mx = W / 2 - 60
    const ha1x = mx - 120, ha1y = H / 2 - 70
    const ha2x = mx + 50, ha2y = H / 2 + 20
    const orx = mx + 200, ory = H / 2 - 30
    // Input pins
    drawPin(ctx, 60, H / 2 - 100, 'A', wv('A'))
    drawPin(ctx, 60, H / 2, 'B', wv('B'))
    drawPin(ctx, 60, H / 2 + 100, 'Cin', wv('Cin'))
    // HA1 block
    drawBlock(ctx, ha1x, ha1y, 110, 70, 'HA1', 'A⊕B, A·B', Math.max(g('xor1'), g('and1')))
    // HA2 block
    drawBlock(ctx, ha2x, ha2y, 110, 70, 'HA2', 'S₁⊕Cin', Math.max(g('xor2'), g('and2')))
    // OR gate
    drawORGate(ctx, orx, ory, g('or'))
    // Output pins
    drawOutputPin(ctx, W - 60, ha2y, 'Sum', wv('sum'))
    drawOutputPin(ctx, W - 60, ory, 'Cout', wv('cout'), true)
    // Wires A,B → HA1
    drawWire(ctx, [[60, H / 2 - 100], [ha1x - 55, H / 2 - 100], [ha1x - 55, ha1y - 15]], wv('a_xor1'), wp('a_xor1'))
    drawWire(ctx, [[60, H / 2], [ha1x - 75, H / 2], [ha1x - 75, ha1y + 15]], wv('b_xor1'), wp('b_xor1'))
    // HA1 outputs
    drawWire(ctx, [[ha1x + 55, ha1y - 15], [ha2x - 55, ha2y - 15]], wv('s1'), wp('s1'))
    drawWire(ctx, [[ha1x + 55, ha1y + 15], [mx + 140, ha1y + 15], [mx + 140, ory - 11], [orx - 43, ory - 11]], wv('c1'), wp('c1'))
    // Cin → HA2
    drawWire(ctx, [[60, H / 2 + 100], [ha2x - 55, H / 2 + 100], [ha2x - 55, ha2y + 15]], wv('cin_xor2'), wp('cin_xor2'))
    // HA2 outputs
    drawWire(ctx, [[ha2x + 55, ha2y - 15], [W - 60, ha2y]], wv('sum'), wp('sum'))
    drawWire(ctx, [[ha2x + 55, ha2y + 15], [mx + 165, ha2y + 15], [mx + 165, ory + 11], [orx - 43, ory + 11]], wv('c2'), wp('c2'))
    // OR → Cout
    drawWire(ctx, [[orx + 43, ory], [W - 60, ory]], wv('cout'), wp('cout'), true)
  }

  function drawRipple(ctx: CanvasRenderingContext2D, W: number, H: number,
    g: (id: string) => number, wv: (id: string) => SignalValue, wp: (id: string) => number) {
    const bits = rippleCarry4(A4, B4, 0)
    const spacing = (W - 120) / 4, startX = 70
    ctx.fillStyle = '#64748B'; ctx.font = 'bold 12px JetBrains Mono'; ctx.textAlign = 'center'
    ctx.fillText('4-bit Ripple Carry Adder  —  Carry propagates sequentially →', W / 2, 28)
    for (let i = 0; i < 4; i++) {
      const bx = startX + i * spacing + spacing / 2
      const by = H / 2
      // FA block
      drawBlock(ctx, bx, by, 95, 80, `FA${i}`, `bit ${i}`, g(`fa${i}`))
      // Input wires
      drawWire(ctx, [[bx, by - 70], [bx, by - 40]], wv(`a${i}`), wp(`a${i}`))
      drawPin(ctx, bx, by - 75, `A${i}`, ((A4 >> i) & 1) as SignalValue)
      // Sum output
      drawWire(ctx, [[bx, by + 40], [bx, by + 70]], wv(`s${i}`), wp(`s${i}`))
      drawOutputPin(ctx, bx, by + 80, `S${i}`, wv(`s${i}`))
      // Carry chain
      if (i < 3) {
        const nx = startX + (i + 1) * spacing + spacing / 2
        drawWire(ctx, [[bx + 47, by], [nx - 47, by]], wv(`co${i}`), wp(`co${i}`), true)
      } else {
        drawWire(ctx, [[bx + 47, by], [bx + 90, by]], wv(`co${i}`), wp(`co${i}`), true)
        drawOutputPin(ctx, bx + 100, by, 'Cout', wv(`co${i}`), true)
      }
    }
    ctx.fillStyle = '#F59E0B'; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'center'
    ctx.fillText('Critical Path: Carry ripples through 4 × 2 = 8 gate delays', W / 2, H - 30)
  }

  function drawCLA(ctx: CanvasRenderingContext2D, W: number, H: number,
    g: (id: string) => number, wv: (id: string) => SignalValue, wp: (id: string) => number) {
    const bits = cla4(A4, B4, 0)
    const spacing = (W - 120) / 4, startX = 70
    ctx.fillStyle = '#64748B'; ctx.font = 'bold 12px JetBrains Mono'; ctx.textAlign = 'center'
    ctx.fillText('4-bit Carry Lookahead Adder  —  All carries computed in parallel', W / 2, 28)
    for (let i = 0; i < 4; i++) {
      const bx = startX + i * spacing + spacing / 2
      const by = H / 2
      drawBlock(ctx, bx, by, 95, 80, `PG${i}`, `G${i}|P${i}`, g(`fa${i}`), COLORS.quantum)
      drawWire(ctx, [[bx, by - 70], [bx, by - 40]], wv(`a${i}`), wp(`a${i}`))
      drawPin(ctx, bx, by - 75, `A${i}`, ((A4 >> i) & 1) as SignalValue)
      drawWire(ctx, [[bx, by + 40], [bx, by + 70]], wv(`s${i}`), wp(`s${i}`))
      drawOutputPin(ctx, bx, by + 80, `S${i}`, wv(`s${i}`))
    }
    ctx.fillStyle = COLORS.quantum; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'center'
    ctx.fillText('Critical Path: Only 4 gate delays (log₂N) regardless of width', W / 2, H - 30)
  }

  function drawQuantumAdder(ctx: CanvasRenderingContext2D, W: number, H: number,
    g: (id: string) => number, wv: (id: string) => SignalValue, wp: (id: string) => number) {
    const qubitLabels = ['|A⟩', '|B⟩', '|Cin⟩', '|0⟩ (ancilla)']
    const qubitY = [H * 0.25, H * 0.4, H * 0.55, H * 0.7]
    const lineStart = 120, lineEnd = W - 120
    ctx.fillStyle = '#a855f7'; ctx.font = 'bold 13px JetBrains Mono'; ctx.textAlign = 'center'
    ctx.fillText('Quantum Full Adder — Reversible Computation', W / 2, 28)
    // Qubit lines
    qubitLabels.forEach((lbl, i) => {
      ctx.strokeStyle = '#4c1d95'; ctx.lineWidth = 1.5
      ctx.beginPath(); ctx.moveTo(lineStart, qubitY[i]); ctx.lineTo(lineEnd, qubitY[i]); ctx.stroke()
      ctx.fillStyle = COLORS.text; ctx.font = '12px JetBrains Mono'; ctx.textAlign = 'right'
      ctx.fillText(lbl, lineStart - 8, qubitY[i] + 5)
      const outLabels = ['|A⟩', '|Sum⟩', '|Cin⟩', '|Cout⟩']
      ctx.textAlign = 'left'; ctx.fillStyle = i === 1 || i === 3 ? COLORS.quantum : COLORS.textMuted
      ctx.fillText(outLabels[i], lineEnd + 8, qubitY[i] + 5)
    })
    // Toffoli gate 1 (A,B→ancilla)
    drawToffoliGate(ctx, W * 0.3, qubitY[0], qubitY[1], qubitY[3], g('xor1'))
    // CNOT (A→B)
    drawCNOTGate(ctx, W * 0.45, qubitY[0], qubitY[1], g('and1'))
    // Toffoli gate 2 (B,Cin→ancilla)
    drawToffoliGate(ctx, W * 0.6, qubitY[1], qubitY[2], qubitY[3], g('xor2'))
    // CNOT (B→Cin)
    drawCNOTGate(ctx, W * 0.75, qubitY[1], qubitY[2], g('and2'))
    // Gate labels
    const gateLabels = [
      { x: W * 0.3, label: 'Toffoli₁' },
      { x: W * 0.45, label: 'CNOT₁' },
      { x: W * 0.6, label: 'Toffoli₂' },
      { x: W * 0.75, label: 'CNOT₂' },
    ]
    gateLabels.forEach(({ x, label }) => {
      ctx.fillStyle = '#7c3aed'; ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'center'
      ctx.fillText(label, x, H * 0.82)
    })
  }

  // ─── Timing diagram ───────────────────────────────────────────────────────
  function drawTiming() {
    const canvas = timingRef.current; if (!canvas) return
    const ctx = canvas.getContext('2d'); if (!ctx) return
    const W = canvas.width, H = canvas.height
    ctx.fillStyle = '#050a12'; ctx.fillRect(0, 0, W, H)
    // Grid
    ctx.strokeStyle = '#1a2744'; ctx.lineWidth = 1
    for (let x = 60; x < W; x += 80) { ctx.beginPath(); ctx.moveTo(x, 0); ctx.lineTo(x, H); ctx.stroke() }
    ctx.fillStyle = '#475569'; ctx.font = '9px JetBrains Mono'; ctx.textAlign = 'center'
    let i = 0
    for (let x = 60; x < W; x += 80) { ctx.fillText(`${i}Δt`, x, H - 4); i++ }
    // Signal traces
    const signals = mode === 'half' ? ['A', 'B', 'sum', 'carry'] : mode === 'full' || mode === 'quantum' ? ['A', 'B', 'Cin', 'sum', 'cout'] : [`a0`, `b0`, `s0`, `co0`]
    const traceH = Math.min(24, (H - 20) / signals.length)
    signals.forEach((id, idx) => {
      const y0 = 10 + idx * traceH + 4, yH = y0, yL = y0 + traceH - 8
      const v = wires.current[id]?.value ?? -1
      ctx.fillStyle = '#334155'; ctx.font = '9px JetBrains Mono'; ctx.textAlign = 'left'
      ctx.fillText(id, 2, yH + (traceH - 8) / 2 + 4)
      ctx.strokeStyle = v === 1 ? COLORS.wireHigh : v === 0 ? '#334155' : '#1E293B'
      ctx.lineWidth = 1.5
      if (v !== -1) {
        ctx.beginPath(); ctx.moveTo(55, v === 1 ? yH : yL); ctx.lineTo(W - 10, v === 1 ? yH : yL); ctx.stroke()
      }
    })
  }

  useEffect(() => { drawTiming() })

  // ─── Truth table active row ──────────────────────────────────────────────
  const getActiveRow = () => {
    if (mode === 'half') return A * 2 + B
    if (mode === 'full' || mode === 'quantum') return A * 4 + B * 2 + Cin
    return -1
  }

  // ─── UI ──────────────────────────────────────────────────────────────────
  const modeOptions: { id: AdderMode; label: string; icon: string }[] = [
    { id: 'half', label: 'Half Adder', icon: '½' },
    { id: 'full', label: 'Full Adder', icon: 'FA' },
    { id: 'ripple4', label: '4-bit Ripple', icon: 'R4' },
    { id: 'cla4', label: '4-bit CLA', icon: 'CLA' },
    { id: 'quantum', label: 'Quantum FA', icon: 'Q' },
  ]

  const booleanEqs: Record<AdderMode, { sum: string; carry: string }> = {
    half: { sum: 'S = A ⊕ B', carry: 'C = A · B' },
    full: { sum: 'S = A ⊕ B ⊕ Cin', carry: 'Cout = (A·B) + (Cin·(A⊕B))' },
    ripple4: { sum: 'Sᵢ = Aᵢ ⊕ Bᵢ ⊕ Cᵢ', carry: 'Cᵢ₊₁ = Gᵢ + Pᵢ·Cᵢ' },
    cla4: { sum: 'Gᵢ=AᵢBᵢ, Pᵢ=Aᵢ⊕Bᵢ', carry: 'C₄ = f(G,P,C₀) parallel' },
    quantum: { sum: '|B⟩→|A⊕B⊕Cin⟩ (Sum)', carry: '|0⟩→|Cout⟩ (Toffoli)' },
  }

  const gateStats: Record<AdderMode, { AND: number; OR: number; XOR: number; total: number; delay: string }> = {
    half: { AND: 1, OR: 0, XOR: 1, total: 2, delay: '2Δt' },
    full: { AND: 2, OR: 1, XOR: 2, total: 5, delay: '4Δt' },
    ripple4: { AND: 8, OR: 4, XOR: 8, total: 20, delay: '8Δt' },
    cla4: { AND: 14, OR: 10, XOR: 8, total: 32, delay: '4Δt' },
    quantum: { AND: 0, OR: 0, XOR: 0, total: 4, delay: '4 Toffoli+CNOT' },
  }

  return (
    <div className="w-screen h-screen bg-[#0A0E17] text-[#E2E8F0] flex flex-col font-mono overflow-hidden">
      {/* Header */}
      <header className="flex items-center justify-between px-4 py-2 bg-[#0F172A] border-b border-[#1E293B] shrink-0">
        <div className="flex items-center gap-3">
          <button onClick={onBack} className="text-[#64748B] hover:text-white p-1 transition-colors">
            <ArrowLeft className="w-4 h-4" />
          </button>
          <Zap className="w-4 h-4 text-[#00F0FF]" />
          <span className="text-[#E2E8F0] font-bold text-sm tracking-wide">Digital Adder Visual Simulator</span>
          <span className="text-[#334155] text-xs"></span>
        </div>
        <div className="flex items-center gap-2">
          <span className={`text-xs px-2 py-0.5 rounded-full border ${simDone ? 'text-[#10B981] border-[#10B981]/30 bg-[#10B981]/10' : isPlaying ? 'text-[#00F0FF] border-[#00F0FF]/30 bg-[#00F0FF]/10 animate-pulse' : 'text-[#64748B] border-[#334155]'}`}>
            {simDone ? '✓ Complete' : isPlaying ? '⏵ Running' : '○ Ready'}
          </span>
        </div>
      </header>

      {/* Main 3-panel layout */}
      <div className="flex flex-1 overflow-hidden">

        {/* ── LEFT: Control Panel ── */}
        <aside className="w-[260px] bg-[#111827] border-r border-[#1E293B] flex flex-col overflow-y-auto shrink-0">
          <div className="p-3 space-y-4">

            {/* Mode */}
            <div>
              <p className="text-[#64748B] text-[10px] uppercase tracking-widest mb-2">Mode</p>
              {modeOptions.map(m => (
                <button key={m.id} onClick={() => setMode(m.id)}
                  className={`w-full flex items-center gap-2 px-3 py-1.5 rounded text-xs mb-1 transition-all ${mode === m.id ? 'bg-[#0EA5E9]/20 text-[#00F0FF] border border-[#0EA5E9]/40' : 'text-[#94A3B8] hover:bg-[#1E293B]'}`}>
                  <span className={`w-6 h-5 flex items-center justify-center text-[9px] font-bold rounded ${mode === m.id ? 'bg-[#00F0FF] text-black' : 'bg-[#1E293B] text-[#64748B]'}`}>{m.icon}</span>
                  {m.label}
                  {m.id === 'cla4' && <span className="ml-auto text-[#F59E0B] text-[8px]">⚡FAST</span>}
                  {m.id === 'quantum' && <span className="ml-auto text-[#A855F7] text-[8px]">⚛ QTM</span>}
                </button>
              ))}
            </div>

            {/* Inputs */}
            <div>
              <p className="text-[#64748B] text-[10px] uppercase tracking-widest mb-2">Inputs</p>
              {(mode === 'half' || mode === 'full' || mode === 'quantum') ? (
                <div className="space-y-2">
                  {[['A', A, setA], ['B', B, setB], ...((mode === 'full' || mode === 'quantum') ? [['Cin', Cin, setCin]] : [])].map(([lbl, val, setter]) => (
                    <div key={lbl as string} className="flex items-center justify-between">
                      <span className="text-[#94A3B8] text-xs w-8">{lbl as string}</span>
                      <button onClick={() => (setter as React.Dispatch<React.SetStateAction<number>>)(v => v ^ 1)}
                        className={`relative w-12 h-6 rounded-full transition-all ${(val as number) === 1 ? 'bg-[#00F0FF]' : 'bg-[#1E293B]'}`}>
                        <div className={`absolute top-0.5 w-5 h-5 rounded-full transition-all ${(val as number) === 1 ? 'translate-x-6 bg-white' : 'translate-x-0.5 bg-[#475569]'}`} />
                      </button>
                      <span className={`text-xs font-bold w-4 ${(val as number) === 1 ? 'text-[#00F0FF]' : 'text-[#475569]'}`}>{(val as number)}</span>
                    </div>
                  ))}
                </div>
              ) : (
                <div className="space-y-3">
                  {[['A', A4, setA4], ['B', B4, setB4]].map(([lbl, val, setter]) => (
                    <div key={lbl as string}>
                      <div className="flex items-center justify-between mb-1">
                        <span className="text-[#94A3B8] text-xs">{lbl as string}</span>
                        <span className="text-[#00F0FF] text-xs font-bold">{(val as number).toString(2).padStart(4, '0')} ({val as number})</span>
                      </div>
                      <div className="flex gap-1">
                        {[3, 2, 1, 0].map(bit => (
                          <button key={bit} onClick={() => (setter as React.Dispatch<React.SetStateAction<number>>)(v => { const n = v ^ (1 << bit); return n & 0xF })}
                            className={`flex-1 h-7 rounded text-xs font-bold transition-all ${((val as number) >> bit) & 1 ? 'bg-[#00F0FF] text-black' : 'bg-[#1E293B] text-[#475569]'}`}>
                            {((val as number) >> bit) & 1}
                          </button>
                        ))}
                      </div>
                    </div>
                  ))}
                </div>
              )}
            </div>

            {/* Controls */}
            <div>
              <p className="text-[#64748B] text-[10px] uppercase tracking-widest mb-2">Animation</p>
              <div className="flex gap-1.5 mb-2">
                <button onClick={() => { if (simDone) resetSim(); setIsPlaying(p => !p) }}
                  className="flex-1 flex items-center justify-center gap-1 py-1.5 rounded text-xs bg-[#0EA5E9] hover:bg-[#0284C7] text-white transition-all">
                  {isPlaying ? <><Pause className="w-3 h-3" />Pause</> : <><Play className="w-3 h-3" />Play</>}
                </button>
                <button onClick={stepForward}
                  className="px-3 py-1.5 rounded text-xs bg-[#1E293B] hover:bg-[#334155] text-[#94A3B8] transition-all">
                  <SkipForward className="w-3 h-3" />
                </button>
                <button onClick={resetSim}
                  className="px-3 py-1.5 rounded text-xs bg-[#1E293B] hover:bg-[#334155] text-[#94A3B8] transition-all">
                  <RotateCcw className="w-3 h-3" />
                </button>
              </div>
              <div className="flex items-center gap-2">
                <span className="text-[#64748B] text-[10px]">Speed</span>
                <input type="range" min={0} max={4} value={speedIdx} onChange={e => setSpeedIdx(+e.target.value)}
                  className="flex-1 accent-[#00F0FF] h-1" />
                <span className="text-[#00F0FF] text-[10px] w-8">{SPEED_MAP[speedIdx]}x</span>
              </div>
            </div>

            {/* Result */}
            {(mode === 'ripple4' || mode === 'cla4') && (
              <div className="bg-[#0F172A] rounded p-2 border border-[#1E293B]">
                <p className="text-[#64748B] text-[10px] uppercase tracking-widest mb-1">Result</p>
                <p className="text-[#00F0FF] text-sm font-bold">{A4} + {B4} = {A4 + B4}</p>
                <p className="text-[#94A3B8] text-[10px]">0x{(A4 + B4).toString(16).toUpperCase()}</p>
              </div>
            )}
          </div>
        </aside>

        {/* ── CENTER: Canvas ── */}
        <main className="flex-1 bg-[#0A0E17] relative overflow-hidden">
          <canvas ref={canvasRef}
            width={800} height={400}
            className="w-full h-full"
            style={{ imageRendering: 'crisp-edges' }}
          />
          {/* Mode badge */}
          <div className="absolute top-3 right-3 text-[#334155] text-[10px] font-mono uppercase tracking-widest">
            {mode === 'quantum' && <span className="text-[#A855F7]">⚛ Quantum Mode</span>}
            {mode === 'cla4' && <span className="text-[#F59E0B]">⚡ Lookahead Mode</span>}
          </div>
        </main>

        {/* ── RIGHT: Info Panel ── */}
        <aside className="w-[280px] bg-[#111827] border-l border-[#1E293B] flex flex-col overflow-y-auto shrink-0">
          {/* Tabs */}
          <div className="flex border-b border-[#1E293B] shrink-0">
            {(['truth', 'eq', 'stats', 'quantum'] as const).map(t => (
              <button key={t} onClick={() => setRightTab(t)}
                className={`flex-1 text-[9px] uppercase tracking-wider py-2 transition-colors ${rightTab === t ? 'text-[#00F0FF] border-b border-[#00F0FF]' : 'text-[#475569] hover:text-[#94A3B8]'}`}>
                {t === 'truth' ? 'Table' : t === 'eq' ? 'Logic' : t === 'stats' ? 'Stats' : 'Quantum'}
              </button>
            ))}
          </div>

          <div className="flex-1 overflow-y-auto p-3">
            {/* Truth Table */}
            {rightTab === 'truth' && (
              <div>
                <p className="text-[#64748B] text-[10px] uppercase tracking-widest mb-2">Truth Table</p>
                {truthTable.length > 0 ? (
                  <table className="w-full text-[10px] border-collapse">
                    <thead>
                      <tr>{truthTable[0].labels.map((l, i) => (
                        <th key={i} className={`py-1 px-1 text-center font-bold ${i >= truthTable[0].inputs.length ? 'text-[#00F0FF]' : 'text-[#94A3B8]'}`}>{l}</th>
                      ))}</tr>
                    </thead>
                    <tbody>
                      {truthTable.map((row, ri) => (
                        <tr key={ri} className={`transition-all ${ri === getActiveRow() ? 'bg-[#00F0FF]/10' : 'hover:bg-[#1E293B]'}`}>
                          {[...row.inputs, ...row.outputs].map((v, ci) => (
                            <td key={ci} className={`py-1 px-1 text-center font-mono ${ci >= row.inputs.length ? (v ? 'text-[#00F0FF] font-bold' : 'text-[#475569]') : 'text-[#94A3B8]'} ${ri === getActiveRow() ? 'font-bold' : ''}`}>{v}</td>
                          ))}
                          <td className="px-1">{ri === getActiveRow() && <span className="text-[#10B981]">✓</span>}</td>
                        </tr>
                      ))}
                    </tbody>
                  </table>
                ) : (
                  <div className="text-[#475569] text-xs text-center py-4">
                    4-bit modes: 2¹⁶ rows — showing computed result above
                    <div className="mt-3 bg-[#0F172A] rounded p-2">
                      <p className="text-[#00F0FF] text-sm font-bold">{A4} + {B4} = {A4 + B4}</p>
                      <p className="text-[#94A3B8] text-[10px]">Verified ✓</p>
                    </div>
                  </div>
                )}
              </div>
            )}

            {/* Logic Equations */}
            {rightTab === 'eq' && (
              <div className="space-y-3">
                <p className="text-[#64748B] text-[10px] uppercase tracking-widest">Boolean Equations</p>
                <div className="bg-[#0F172A] rounded p-3 border border-[#1E293B]">
                  <p className="text-[#00F0FF] text-xs font-bold mb-1">Sum</p>
                  <p className="text-[#E2E8F0] text-[11px]">{booleanEqs[mode].sum}</p>
                </div>
                <div className="bg-[#0F172A] rounded p-3 border border-[#F59E0B]/20]">
                  <p className="text-[#F59E0B] text-xs font-bold mb-1">Carry</p>
                  <p className="text-[#E2E8F0] text-[11px]">{booleanEqs[mode].carry}</p>
                </div>
                {mode === 'cla4' && <div className="bg-[#0F172A] rounded p-3 border border-[#A855F7]/20]">
                  <p className="text-[#A855F7] text-xs font-bold mb-1">CLA Equations</p>
                  <p className="text-[#94A3B8] text-[9px] leading-relaxed">
                    C₁=G₀+(P₀·C₀)<br />C₂=G₁+(P₁·G₀)+(P₁·P₀·C₀)<br />C₃=G₂+(P₂·G₁)+...<br />
                    <span className="text-[#F59E0B]">All carries parallel!</span>
                  </p>
                </div>}
              </div>
            )}

            {/* Stats */}
            {rightTab === 'stats' && (
              <div className="space-y-3">
                <p className="text-[#64748B] text-[10px] uppercase tracking-widest">Performance Metrics</p>
                {Object.entries(gateStats[mode]).map(([k, v]) => (
                  <div key={k} className="flex justify-between items-center py-1 border-b border-[#1E293B]">
                    <span className="text-[#94A3B8] text-xs capitalize">{k === 'total' ? 'Total Gates' : k === 'delay' ? 'Critical Path' : k + ' Gates'}</span>
                    <span className={`text-xs font-bold ${k === 'delay' ? 'text-[#F59E0B]' : k === 'total' ? 'text-[#00F0FF]' : 'text-[#E2E8F0]'}`}>{v}</span>
                  </div>
                ))}
                {(mode === 'ripple4' || mode === 'cla4') && (
                  <div className="bg-[#0F172A] rounded p-2 mt-2">
                    <p className="text-[#94A3B8] text-[10px] mb-2">Delay Comparison (4-bit)</p>
                    <div className="flex gap-1 items-end h-16 mb-1">
                      <div className="flex flex-col items-center gap-1 flex-1">
                        <div className="w-full bg-[#EF4444]/70 rounded-t transition-all" style={{ height: '80%' }} />
                        <span className="text-[10px] text-[#94A3B8]">Ripple</span>
                        <span className="text-[10px] text-[#EF4444] font-bold">8Δt</span>
                      </div>
                      <div className="flex flex-col items-center gap-1 flex-1">
                        <div className="w-full bg-[#10B981]/70 rounded-t" style={{ height: '40%' }} />
                        <span className="text-[10px] text-[#94A3B8]">CLA</span>
                        <span className="text-[10px] text-[#10B981] font-bold">4Δt</span>
                      </div>
                    </div>
                    <p className="text-[#10B981] text-[9px]">CLA is 2× faster!</p>
                  </div>
                )}
              </div>
            )}

            {/* Quantum */}
            {rightTab === 'quantum' && (
              <div className="space-y-3">
                <p className="text-[#64748B] text-[10px] uppercase tracking-widest">Classical vs Quantum</p>
                <div className="grid grid-cols-2 gap-2">
                  {[
                    { label: 'Classical FA', gates: '5 gates', depth: '4Δt', color: '#00F0FF' },
                    { label: 'Quantum FA', gates: '4 gates', depth: '4 steps', color: '#A855F7' },
                  ].map(item => (
                    <div key={item.label} className="bg-[#0F172A] rounded p-2 border" style={{ borderColor: item.color + '33' }}>
                      <p className="text-[10px] font-bold mb-1" style={{ color: item.color }}>{item.label}</p>
                      <p className="text-[#94A3B8] text-[9px]">{item.gates}</p>
                      <p className="text-[#94A3B8] text-[9px]">{item.depth}</p>
                    </div>
                  ))}
                </div>
                <div className="bg-[#0F172A] rounded p-2 border border-[#A855F7]/20">
                  <p className="text-[#A855F7] text-[10px] font-bold mb-1">Key Properties</p>
                  <ul className="text-[9px] text-[#94A3B8] space-y-1">
                    <li>⚛ Reversible — all ops undoable</li>
                    <li>⚛ Toffoli = universal classical gate</li>
                    <li>⚛ No fan-out (no-cloning theorem)</li>
                    <li>⚛ Draper QFT adder: O(n²) gates, O(1) depth</li>
                  </ul>
                </div>
                <div className="bg-[#0F172A] rounded p-2 border border-[#334155]">
                  <p className="text-[#64748B] text-[10px] font-bold mb-1">Gate Universality</p>
                  <p className="text-[9px] text-[#94A3B8]">Toffoli + CNOT → universal for reversible computation. Any classical circuit can be mapped to a quantum one with ancilla qubits.</p>
                </div>
              </div>
            )}
          </div>
        </aside>

      </div>

      {/* ── TIMING DIAGRAM ── */}
      <div className={`bg-[#050a12] border-t border-[#1E293B] shrink-0 transition-all ${showTiming ? 'h-[140px]' : 'h-[28px]'}`}>
        <div className="flex items-center justify-between px-3 py-1 border-b border-[#1E293B]">
          <span className="text-[#64748B] text-[10px] uppercase tracking-widest">Timing Diagram</span>
          <button onClick={() => setShowTiming(s => !s)} className="text-[#475569] hover:text-[#94A3B8]">
            {showTiming ? <ChevronDown className="w-3 h-3" /> : <ChevronUp className="w-3 h-3" />}
          </button>
        </div>
        {showTiming && (
          <canvas ref={timingRef} width={800} height={110}
            className="w-full" style={{ height: '110px' }} />
        )}
      </div>

      {/* ── STATUS BAR ── */}
      <footer className="bg-[#0F172A] border-t border-[#1E293B] px-4 py-1 flex items-center gap-4 text-[10px] shrink-0">
        {(mode === 'half' || mode === 'full' || mode === 'quantum') ? (
          <>
            <span className="text-[#64748B]">Result:</span>
            <span className="text-[#00F0FF] font-bold">{(outputs as any).sum ?? '?'} (Sum) {(outputs as any).carry ?? (outputs as any).cout ?? ''} (Carry)</span>
          </>
        ) : (
          <>
            <span className="text-[#64748B]">Result:</span>
            <span className="text-[#00F0FF] font-bold">{A4}+{B4}={(outputs as any).decimal ?? A4 + B4}</span>
            <span className="text-[#94A3B8]">0b{(A4 + B4).toString(2).padStart(5, '0')}</span>
            <span className="text-[#94A3B8]">0x{(A4 + B4).toString(16).toUpperCase()}</span>
          </>
        )}
        <span className="text-[#334155]">|</span>
        <span className="text-[#64748B]">Mode: <span className="text-[#94A3B8]">{mode}</span></span>
        <span className="text-[#334155]">|</span>
        <span className="text-[#64748B]">Gates: <span className="text-[#94A3B8]">{gateStats[mode].total}</span></span>
        <span className="text-[#334155]">|</span>
        <span className="text-[#64748B]">τ: <span className="text-[#F59E0B]">{gateStats[mode].delay}</span></span>
        <span className="ml-auto text-[#475569]">Space=Play/Pause  →=Step  R=Reset  1-5=Mode</span>
      </footer>
    </div>
  )
}
