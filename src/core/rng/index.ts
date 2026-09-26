/**
 * Seeded, order-independent randomness.
 *
 * This is what makes the deterministic engine reproducible WHILE STREAMING:
 * because each value is derived from `(runSeed, key, round, stage)` rather than
 * from one sequential stream, the result for any one agent does not depend on
 * how many other agents were processed first.
 *
 * Consequences:
 *  - events are order-independent and reproducible
 *  - replaying a run produces byte-identical output
 *  - fixing one agent's model does not shift every other agent's results
 *
 * No Math.random() anywhere in core/ or engines/.
 */

/** 32-bit FNV-1a. Stable across processes and platforms. */
export function hash32(...parts: Array<string | number>): number {
  let h = 0x811c9dc5;
  const joined = parts.map((p) => String(p)).join('\u0001');
  for (let i = 0; i < joined.length; i++) {
    h ^= joined.charCodeAt(i);
    // h *= 16777619, in 32-bit space
    h = Math.imul(h, 0x01000193) >>> 0;
  }
  return h >>> 0;
}

/** Deterministic PRNG. Small, fast, adequate for simulation sampling. */
export function mulberry32(seed: number): () => number {
  let a = seed >>> 0;
  return function next(): number {
    a = (a + 0x6d2b79f5) >>> 0;
    let t = a;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

/** A named, isolated RNG for one decision point. */
export function rngFor(runSeed: number, ...key: Array<string | number>): () => number {
  return mulberry32(hash32(runSeed, ...key));
}

export function pick<T>(rng: () => number, items: readonly T[]): T {
  if (items.length === 0) throw new Error('pick() called with an empty array');
  const idx = Math.floor(rng() * items.length);
  return items[Math.min(idx, items.length - 1)] as T;
}

/** Stable shuffle driven by a seeded rng. */
export function shuffle<T>(rng: () => number, items: readonly T[]): T[] {
  const out = [...items];
  for (let i = out.length - 1; i > 0; i--) {
    const j = Math.floor(rng() * (i + 1));
    const a = out[i] as T;
    const b = out[j] as T;
    out[i] = b;
    out[j] = a;
  }
  return out;
}

/** Logistic function, used by the reaction model. */
export function sigmoid(x: number): number {
  return 1 / (1 + Math.exp(-x));
}

export function clamp01(x: number): number {
  if (Number.isNaN(x)) return 0;
  return x < 0 ? 0 : x > 1 ? 1 : x;
}

export function round1(x: number): number {
  return Math.round(x * 10) / 10;
}
