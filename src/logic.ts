// Core logic types and classes for the Digital Adder Simulator

export type GateType = 'AND' | 'OR' | 'XOR' | 'NOT' | 'NAND' | 'NOR' | 'TOFFOLI' | 'CNOT';
export type SignalValue = 0 | 1 | -1; // -1 = undefined/unknown

export interface Point {
  x: number;
  y: number;
}

export interface WireSegment {
  start: Point;
  end: Point;
}

export interface Wire {
  id: string;
  segments: WireSegment[];
  value: SignalValue;
  animProgress: number; // 0..1 for signal travel
  isAnimating: boolean;
  label?: string;
}

export interface Gate {
  id: string;
  type: GateType;
  label?: string;
  position: Point;
  inputWireIds: string[];
  outputWireId: string;
  state: 'idle' | 'processing' | 'resolved';
  delay: number; // gate delay in units
  glowIntensity: number; // 0..1 for animation
}

export type AdderMode = 'half' | 'full' | 'ripple4' | 'cla4' | 'quantum';

export interface CircuitState {
  gates: Gate[];
  wires: Wire[];
  inputs: Record<string, SignalValue>;
  outputs: Record<string, SignalValue>;
  mode: AdderMode;
}

export function evaluateGate(type: GateType, inputs: SignalValue[]): SignalValue {
  const allDefined = inputs.every(v => v !== -1);
  if (!allDefined) return -1;
  const a = inputs[0] as 0 | 1;
  const b = inputs[1] as 0 | 1;
  switch (type) {
    case 'AND':  return (a & b) as SignalValue;
    case 'OR':   return (a | b) as SignalValue;
    case 'XOR':  return (a ^ b) as SignalValue;
    case 'NOT':  return (a === 1 ? 0 : 1) as SignalValue;
    case 'NAND': return ((a & b) === 1 ? 0 : 1) as SignalValue;
    case 'NOR':  return ((a | b) === 1 ? 0 : 1) as SignalValue;
    default: return -1;
  }
}

export interface SimStep {
  gateId: string;
  inputValues: SignalValue[];
  outputValue: SignalValue;
  time: number;
}

/** Full adder truth table for a single bit */
export function fullAdderBit(a: number, b: number, cin: number) {
  const sum = (a ^ b ^ cin) as SignalValue;
  const cout = ((a & b) | (cin & (a ^ b))) as SignalValue;
  return { sum, cout };
}

/** 4-bit ripple carry logic */
export function rippleCarry4(A: number, B: number, cin: number) {
  const bits: Array<{ s: number; cout: number }> = [];
  let carry = cin;
  for (let i = 0; i < 4; i++) {
    const a = (A >> i) & 1;
    const b = (B >> i) & 1;
    const { sum, cout } = fullAdderBit(a, b, carry);
    bits.push({ s: sum, cout });
    carry = cout;
  }
  return bits;
}

/** 4-bit CLA logic */
export function cla4(A: number, B: number, cin: number) {
  const G = [], P = [];
  for (let i = 0; i < 4; i++) {
    const a = (A >> i) & 1;
    const b = (B >> i) & 1;
    G.push(a & b);
    P.push(a ^ b);
  }
  const C: number[] = [cin];
  C[1] = G[0] | (P[0] & C[0]);
  C[2] = G[1] | (P[1] & G[0]) | (P[1] & P[0] & C[0]);
  C[3] = G[2] | (P[2] & G[1]) | (P[2] & P[1] & G[0]) | (P[2] & P[1] & P[0] & C[0]);
  C[4] = G[3] | (P[3] & G[2]) | (P[3] & P[2] & G[1]) | (P[3] & P[2] & P[1] & G[0]) | (P[3] & P[2] & P[1] & P[0] & C[0]);
  const sums = P.map((p, i) => (p ^ C[i]) as SignalValue);
  return { sums, carries: C, G, P };
}

export function genTruthTable(mode: AdderMode) {
  if (mode === 'half') {
    return Array.from({ length: 4 }, (_, i) => {
      const a = (i >> 1) & 1;
      const b = i & 1;
      const sum = a ^ b;
      const carry = a & b;
      return { inputs: [a, b], outputs: [sum, carry], labels: ['A', 'B', 'Sum', 'Carry'] };
    });
  }
  if (mode === 'full' || mode === 'quantum') {
    return Array.from({ length: 8 }, (_, i) => {
      const a = (i >> 2) & 1;
      const b = (i >> 1) & 1;
      const cin = i & 1;
      const { sum, cout } = fullAdderBit(a, b, cin);
      return { inputs: [a, b, cin], outputs: [sum, cout], labels: ['A', 'B', 'Cin', 'Sum', 'Cout'] };
    });
  }
  return [];
}
