// Canvas drawing helpers for the Digital Adder Simulator

export type SignalValue = 0 | 1 | -1

export const COLORS = {
  bg: '#0A0E17',
  gateBody: '#1E293B',
  gateStroke: '#334155',
  gateActive: '#0C4A6E',
  gateActiveStroke: '#00F0FF',
  wireOff: '#334155',
  wireHigh: '#00F0FF',
  wireLow: '#1E3A5F',
  wireCarry: '#F59E0B',
  text: '#E2E8F0',
  textMuted: '#64748B',
  quantum: '#A855F7',
  junction: '#00F0FF',
}

function applyGlow(ctx: CanvasRenderingContext2D, color: string, blur: number) {
  ctx.shadowColor = color; ctx.shadowBlur = blur
}
function clearGlow(ctx: CanvasRenderingContext2D) {
  ctx.shadowBlur = 0
}

// Wire color based on signal value
function wireColor(v: SignalValue, isCarry = false): string {
  if (v === -1) return COLORS.wireOff
  if (v === 0) return COLORS.wireLow
  return isCarry ? COLORS.wireCarry : COLORS.wireHigh
}

// Get x,y at fraction t along a polyline
function pointAlongPolyline(pts: [number,number][], t: number): [number,number] {
  if (pts.length === 1) return pts[0]
  const lengths: number[] = []
  let totalLen = 0
  for (let i = 1; i < pts.length; i++) {
    const dx = pts[i][0]-pts[i-1][0], dy = pts[i][1]-pts[i-1][1]
    const l = Math.sqrt(dx*dx+dy*dy)
    lengths.push(l); totalLen += l
  }
  let target = t * totalLen
  for (let i = 0; i < lengths.length; i++) {
    if (target <= lengths[i]) {
      const frac = target / lengths[i]
      const [x0,y0] = pts[i], [x1,y1] = pts[i+1]
      return [x0 + (x1-x0)*frac, y0 + (y1-y0)*frac]
    }
    target -= lengths[i]
  }
  return pts[pts.length-1]
}

// Draw a wire (polyline) with optional animated signal
export function drawWire(
  ctx: CanvasRenderingContext2D,
  pts: [number,number][],
  value: SignalValue,
  progress: number,  // 0..1, how far signal has traveled
  isCarry = false,
  label?: string
) {
  const color = wireColor(value, isCarry)
  ctx.lineWidth = 2
  ctx.lineCap = 'round'; ctx.lineJoin = 'round'

  if (value !== -1 && progress > 0) {
    // Draw "settled" portion in active color
    ctx.strokeStyle = color
    if (value === 1) applyGlow(ctx, color, 8)
    ctx.beginPath()
    // Draw the portion of the wire up to progress
    const [px, py] = pointAlongPolyline(pts, progress)
    // Trace from start to progress point
    const partial = getPartialPath(pts, progress)
    ctx.moveTo(partial[0][0], partial[0][1])
    for (let i = 1; i < partial.length; i++) ctx.lineTo(partial[i][0], partial[i][1])
    ctx.lineTo(px, py)
    ctx.stroke()
    clearGlow(ctx)
    // Draw remaining wire in inactive color
    ctx.strokeStyle = COLORS.wireOff
    ctx.beginPath()
    ctx.moveTo(px, py)
    const rest = pts.slice() // we need to draw rest from px,py to end
    const endPartial = getPartialPath(pts, progress)
    // Simple: draw full wire in dim, then overlay settled
    // Already done above - just draw dim rest
    ctx.moveTo(px, py)
    // Walk remaining path
    let acc = 0, totalLen = 0
    const lengths: number[] = []
    for (let i=1;i<pts.length;i++){const dx=pts[i][0]-pts[i-1][0],dy=pts[i][1]-pts[i-1][1];const l=Math.sqrt(dx*dx+dy*dy);lengths.push(l);totalLen+=l}
    const targetLen = progress * totalLen
    let walked = 0
    for (let i=0;i<lengths.length;i++){
      walked+=lengths[i]
      if(walked>=targetLen){ctx.lineTo(pts[i+1][0],pts[i+1][1])}
    }
    ctx.stroke()
    // Animated dot at progress position
    if (progress < 1) {
      applyGlow(ctx, color, 15)
      ctx.fillStyle = color
      ctx.beginPath(); ctx.arc(px, py, 4, 0, Math.PI * 2); ctx.fill()
      clearGlow(ctx)
    }
  } else {
    // Inactive wire
    ctx.strokeStyle = COLORS.wireOff
    ctx.beginPath()
    ctx.moveTo(pts[0][0], pts[0][1])
    for (let i = 1; i < pts.length; i++) ctx.lineTo(pts[i][0], pts[i][1])
    ctx.stroke()
  }

  if (label) {
    const [lx, ly] = pts[pts.length - 1]
    ctx.fillStyle = COLORS.textMuted
    ctx.font = '10px JetBrains Mono, monospace'
    ctx.textAlign = 'left'
    ctx.fillText(label, lx + 4, ly - 4)
  }
}

function getPartialPath(pts: [number,number][], t: number): [number,number][] {
  const lengths: number[] = []; let total = 0
  for (let i=1;i<pts.length;i++){const dx=pts[i][0]-pts[i-1][0],dy=pts[i][1]-pts[i-1][1];lengths.push(Math.sqrt(dx*dx+dy*dy));total+=Math.sqrt(dx*dx+dy*dy)}
  const target = t * total; let acc = 0
  const result: [number,number][] = [pts[0]]
  for (let i=0;i<lengths.length;i++){
    if(acc+lengths[i]>=target){const frac=(target-acc)/lengths[i];result.push([pts[i][0]+(pts[i+1][0]-pts[i][0])*frac,pts[i][1]+(pts[i+1][1]-pts[i][1])*frac]);break}
    acc+=lengths[i];result.push(pts[i+1])
  }
  return result
}

// Draw a junction dot
export function drawJunction(ctx: CanvasRenderingContext2D, x: number, y: number, active: boolean) {
  ctx.fillStyle = active ? COLORS.wireHigh : COLORS.wireOff
  if (active) applyGlow(ctx, COLORS.wireHigh, 6)
  ctx.beginPath(); ctx.arc(x, y, 4, 0, Math.PI * 2); ctx.fill()
  clearGlow(ctx)
}

// Draw AND gate body (cx, cy = center of body, not including stubs)
export function drawANDGate(ctx: CanvasRenderingContext2D, cx: number, cy: number, glow: number, label = 'AND') {
  const w = 50, h = 44, r = h / 2
  const x = cx - w / 2, y = cy - r
  const bodyColor = glow > 0 ? COLORS.gateActive : COLORS.gateBody
  const strokeColor = glow > 0 ? COLORS.gateActiveStroke : COLORS.gateStroke
  if (glow > 0) applyGlow(ctx, COLORS.gateActiveStroke, 12 * glow)
  ctx.fillStyle = bodyColor; ctx.strokeStyle = strokeColor; ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x, y); ctx.lineTo(cx, y)
  ctx.arc(cx, cy, r, -Math.PI/2, Math.PI/2)
  ctx.lineTo(x, y + h); ctx.closePath()
  ctx.fill(); ctx.stroke()
  clearGlow(ctx)
  // Input stubs
  ctx.strokeStyle = strokeColor; ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x - 15, cy - 11); ctx.lineTo(x, cy - 11)
  ctx.moveTo(x - 15, cy + 11); ctx.lineTo(x, cy + 11)
  ctx.stroke()
  // Output stub (from end of semicircle)
  ctx.beginPath(); ctx.moveTo(cx + r, cy); ctx.lineTo(cx + r + 15, cy); ctx.stroke()
  // Label
  ctx.fillStyle = COLORS.text; ctx.font = 'bold 10px JetBrains Mono, monospace'
  ctx.textAlign = 'center'; ctx.fillText(label, cx - 5, cy + 4)
}

export function drawORGate(ctx: CanvasRenderingContext2D, cx: number, cy: number, glow: number, label = 'OR') {
  const x = cx - 30, y = cy - 22, w = 60, h = 44
  const bodyColor = glow > 0 ? COLORS.gateActive : COLORS.gateBody
  const strokeColor = glow > 0 ? COLORS.gateActiveStroke : COLORS.gateStroke
  if (glow > 0) applyGlow(ctx, COLORS.gateActiveStroke, 12 * glow)
  ctx.fillStyle = bodyColor; ctx.strokeStyle = strokeColor; ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x, y)
  ctx.quadraticCurveTo(x + w * 0.35, y, x + w, y + h / 2)
  ctx.quadraticCurveTo(x + w * 0.35, y + h, x, y + h)
  ctx.quadraticCurveTo(x + w * 0.2, y + h / 2, x, y)
  ctx.closePath(); ctx.fill(); ctx.stroke()
  clearGlow(ctx)
  ctx.strokeStyle = strokeColor; ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x - 15, cy - 11); ctx.lineTo(x + 7, cy - 11)
  ctx.moveTo(x - 15, cy + 11); ctx.lineTo(x + 7, cy + 11)
  ctx.moveTo(x + w, cy); ctx.lineTo(x + w + 15, cy)
  ctx.stroke()
  ctx.fillStyle = COLORS.text; ctx.font = 'bold 10px JetBrains Mono, monospace'
  ctx.textAlign = 'center'; ctx.fillText(label, cx - 5, cy + 4)
}

export function drawXORGate(ctx: CanvasRenderingContext2D, cx: number, cy: number, glow: number, label = 'XOR') {
  drawORGate(ctx, cx, cy, glow, label)
  const x = cx - 30, y = cy - 22
  // Extra curved line at input
  const strokeColor = glow > 0 ? COLORS.gateActiveStroke : COLORS.gateStroke
  if (glow > 0) applyGlow(ctx, COLORS.gateActiveStroke, 8 * glow)
  ctx.strokeStyle = strokeColor; ctx.lineWidth = 1.5
  ctx.beginPath()
  ctx.moveTo(x - 7, y); ctx.quadraticCurveTo(x - 7 + 12, cy, x - 7, y + 44)
  ctx.stroke(); clearGlow(ctx)
}

export function drawNOTGate(ctx: CanvasRenderingContext2D, cx: number, cy: number, glow: number) {
  const x = cx - 28, y = cy
  const bodyColor = glow > 0 ? COLORS.gateActive : COLORS.gateBody
  const strokeColor = glow > 0 ? COLORS.gateActiveStroke : COLORS.gateStroke
  if (glow > 0) applyGlow(ctx, COLORS.gateActiveStroke, 12 * glow)
  ctx.fillStyle = bodyColor; ctx.strokeStyle = strokeColor; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(x, y - 18); ctx.lineTo(x + 36, y); ctx.lineTo(x, y + 18); ctx.closePath()
  ctx.fill(); ctx.stroke()
  ctx.beginPath(); ctx.arc(x + 39, y, 4, 0, Math.PI * 2); ctx.fill(); ctx.stroke()
  clearGlow(ctx)
  ctx.strokeStyle = strokeColor
  ctx.beginPath(); ctx.moveTo(x - 15, y); ctx.lineTo(x, y)
  ctx.moveTo(x + 43, y); ctx.lineTo(x + 55, y); ctx.stroke()
}

// Draw a labeled input pin with toggle state
export function drawPin(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, value: SignalValue) {
  const color = value === 1 ? COLORS.wireHigh : value === 0 ? '#475569' : COLORS.wireOff
  if (value === 1) applyGlow(ctx, COLORS.wireHigh, 8)
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill()
  clearGlow(ctx)
  ctx.fillStyle = COLORS.text; ctx.font = 'bold 11px JetBrains Mono, monospace'
  ctx.textAlign = 'right'; ctx.fillText(label, x - 12, y + 4)
  ctx.fillStyle = value === 1 ? COLORS.wireHigh : '#94A3B8'
  ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'left'
  ctx.fillText(value === -1 ? '?' : String(value), x + 10, y + 4)
}

export function drawOutputPin(ctx: CanvasRenderingContext2D, x: number, y: number, label: string, value: SignalValue, isCarry = false) {
  const color = value === 1 ? (isCarry ? COLORS.wireCarry : COLORS.wireHigh) : value === 0 ? '#475569' : COLORS.wireOff
  if (value === 1) applyGlow(ctx, color, 8)
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(x, y, 6, 0, Math.PI * 2); ctx.fill()
  clearGlow(ctx)
  ctx.fillStyle = COLORS.text; ctx.font = 'bold 11px JetBrains Mono, monospace'
  ctx.textAlign = 'left'; ctx.fillText(label, x + 12, y + 4)
  ctx.fillStyle = value === 1 ? color : '#94A3B8'
  ctx.font = '10px JetBrains Mono'; ctx.textAlign = 'right'
  ctx.fillText(value === -1 ? '?' : String(value), x - 10, y + 4)
}

export function drawBlock(ctx: CanvasRenderingContext2D, cx: number, cy: number, w: number, h: number,
  label: string, sublabel: string, glow: number, color = COLORS.gateActiveStroke) {
  const x = cx - w/2, y = cy - h/2
  const bodyColor = glow > 0 ? 'rgba(12,74,110,0.9)' : COLORS.gateBody
  const strokeColor = glow > 0 ? color : COLORS.gateStroke
  if (glow > 0) applyGlow(ctx, color, 10 * glow)
  ctx.fillStyle = bodyColor; ctx.strokeStyle = strokeColor; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.roundRect(x, y, w, h, 6); ctx.fill(); ctx.stroke()
  clearGlow(ctx)
  ctx.fillStyle = COLORS.text; ctx.font = 'bold 12px JetBrains Mono, monospace'
  ctx.textAlign = 'center'; ctx.fillText(label, cx, cy - 4)
  ctx.fillStyle = COLORS.textMuted; ctx.font = '9px JetBrains Mono, monospace'
  ctx.fillText(sublabel, cx, cy + 10)
}

export function drawToffoliGate(ctx: CanvasRenderingContext2D, x: number, y1: number, y2: number, y3: number, glow: number) {
  const color = glow > 0 ? COLORS.quantum : '#6d28d9'
  if (glow > 0) applyGlow(ctx, color, 10)
  // Vertical line connecting
  ctx.strokeStyle = color; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(x, y1); ctx.lineTo(x, y3); ctx.stroke()
  // Control dots
  ctx.fillStyle = color
  ctx.beginPath(); ctx.arc(x, y1, 5, 0, Math.PI*2); ctx.fill()
  ctx.beginPath(); ctx.arc(x, y2, 5, 0, Math.PI*2); ctx.fill()
  // Target XOR circle
  ctx.strokeStyle = color; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(x, y3, 12, 0, Math.PI*2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x-12, y3); ctx.lineTo(x+12, y3)
  ctx.moveTo(x, y3-12); ctx.lineTo(x, y3+12); ctx.stroke()
  clearGlow(ctx)
}

export function drawCNOTGate(ctx: CanvasRenderingContext2D, x: number, yCtrl: number, yTarget: number, glow: number) {
  const color = glow > 0 ? COLORS.quantum : '#6d28d9'
  if (glow > 0) applyGlow(ctx, color, 10)
  ctx.strokeStyle = color; ctx.lineWidth = 1.5
  ctx.beginPath(); ctx.moveTo(x, yCtrl); ctx.lineTo(x, yTarget); ctx.stroke()
  ctx.fillStyle = color; ctx.beginPath(); ctx.arc(x, yCtrl, 5, 0, Math.PI*2); ctx.fill()
  ctx.strokeStyle = color; ctx.lineWidth = 2
  ctx.beginPath(); ctx.arc(x, yTarget, 11, 0, Math.PI*2); ctx.stroke()
  ctx.beginPath(); ctx.moveTo(x-11, yTarget); ctx.lineTo(x+11, yTarget)
  ctx.moveTo(x, yTarget-11); ctx.lineTo(x, yTarget+11); ctx.stroke()
  clearGlow(ctx)
}

export { pointAlongPolyline }
