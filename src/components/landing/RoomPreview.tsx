'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import { cn } from '../../lib/cn';

/**
 * The hero object: a room of readers reacting, and then disagreeing.
 *
 * This is the one piece of non-user-triggered motion on the page, and it earns
 * its place because the split IS the product. A static screenshot or a big
 * gradient number would describe the thing; this performs it.
 *
 * Deterministic and self-contained — no API call, no randomness that could
 * produce an ugly frame. It runs a four-beat loop:
 *
 *   arrive  → the readers are in the room, none has read anything yet
 *   react   → each one adopts its reaction, staggered
 *   split   → the room pulls apart into the two camps
 *   hold    → the count sits still long enough to be read
 */

const COUNT = 72;

type Phase = 'arrive' | 'react' | 'split' | 'hold';

const PHASE_MS: Record<Phase, number> = {
  arrive: 1700,
  react: 2200,
  split: 1900,
  hold: 2600,
};

const NEXT: Record<Phase, Phase> = {
  arrive: 'react',
  react: 'split',
  split: 'hold',
  hold: 'arrive',
};

/** Deterministic hash → [0,1). Same layout on server and client, every reload. */
function rand(seed: number): number {
  const x = Math.sin(seed * 127.1 + 311.7) * 43758.5453;
  return x - Math.floor(x);
}

type Reader = {
  id: number;
  /** Clustered start position, in percent of the box. */
  x: number;
  y: number;
  /** Where this reader ends up once the room splits. */
  splitX: number;
  splitY: number;
  /** true = passed it on, false = argued back. */
  withIt: boolean;
  size: number;
  delay: number;
};

function buildReaders(): Reader[] {
  const out: Reader[] = [];
  for (let i = 0; i < COUNT; i += 1) {
    // A rough disc, so the starting state reads as one crowd.
    const a = rand(i) * Math.PI * 2;
    const r = Math.sqrt(rand(i + 99)) * 33;
    const x = 50 + Math.cos(a) * r * 1.35;
    const y = 50 + Math.sin(a) * r;

    // 58/42 split: a real audience disagrees, and a near-even split is the
    // interesting case this product exists to surface.
    const withIt = rand(i + 7) > 0.42;

    // Each camp reforms as its own disc, pulled off-centre along the seam.
    const sa = rand(i + 41) * Math.PI * 2;
    const sr = Math.sqrt(rand(i + 13)) * 20;
    const cx = withIt ? 26 : 74;
    const splitX = cx + Math.cos(sa) * sr * 0.95;
    const splitY = 50 + Math.sin(sa) * sr * 1.15;

    out.push({
      id: i,
      x,
      y,
      splitX,
      splitY,
      withIt,
      size: 6 + rand(i + 55) * 4,
      delay: rand(i + 3) * 900,
    });
  }
  return out;
}

export function RoomPreview({ className }: { className?: string }) {
  const readers = useMemo(buildReaders, []);
  const [phase, setPhase] = useState<Phase>('arrive');
  const timer = useRef<ReturnType<typeof setTimeout> | null>(null);

  useEffect(() => {
    // Honour reduced motion by parking on the finished state rather than
    // looping: the split is the information, the animation is not.
    const reduce =
      typeof window !== 'undefined' &&
      window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    if (reduce) {
      setPhase('hold');
      return;
    }
    timer.current = setTimeout(() => setPhase(NEXT[phase]), PHASE_MS[phase]);
    return () => {
      if (timer.current) clearTimeout(timer.current);
    };
  }, [phase]);

  const reacted = phase !== 'arrive';
  const split = phase === 'split' || phase === 'hold';
  const withCount = readers.filter((r) => r.withIt).length;

  return (
    <div
      className={cn(
        'relative aspect-4/3 w-full overflow-hidden rounded-2xl border border-line-soft bg-bg',
        className,
      )}
      // Decorative: the caption underneath carries the same information.
      aria-hidden
    >
      {/* The seam the room tears along. */}
      <div
        className="absolute inset-y-8 left-1/2 w-px -translate-x-1/2 bg-line transition-opacity duration-700"
        style={{ opacity: split ? 1 : 0 }}
      />

      {readers.map((r) => {
        const x = split ? r.splitX : r.x;
        const y = split ? r.splitY : r.y;
        const color = !reacted
          ? 'var(--color-cold)'
          : r.withIt
            ? 'var(--color-amplify)'
            : 'var(--color-negative)';
        return (
          <span
            key={r.id}
            className="absolute rounded-full"
            style={{
              left: `${x}%`,
              top: `${y}%`,
              width: r.size,
              height: r.size,
              marginLeft: -r.size / 2,
              marginTop: -r.size / 2,
              background: color,
              opacity: reacted ? 0.92 : 0.4,
              boxShadow: reacted ? `0 0 12px ${color}` : 'none',
              transition: `left 1.5s cubic-bezier(.22,1,.36,1) ${r.delay * 0.35}ms,
                           top 1.5s cubic-bezier(.22,1,.36,1) ${r.delay * 0.35}ms,
                           background-color .6s ease ${r.delay}ms,
                           opacity .6s ease ${r.delay}ms,
                           box-shadow .6s ease ${r.delay}ms`,
            }}
          />
        );
      })}

      {/* The content everyone is reacting to, held at the centre until the
          room tears away from it. */}
      <div
        className="absolute top-1/2 left-1/2 -translate-x-1/2 -translate-y-1/2 rounded-lg border border-line bg-surface px-3 py-2 transition-opacity duration-500"
        style={{ opacity: split ? 0 : 1 }}
      >
        <span className="text-fine text-muted">Your post</span>
      </div>

      {/* The count, once the split has settled. */}
      <div
        className="absolute inset-x-0 bottom-0 flex items-center justify-between px-4 py-3 transition-opacity duration-500"
        style={{ opacity: phase === 'hold' ? 1 : 0 }}
      >
        <span className="text-fine text-amplify">{withCount} passed it on</span>
        <span className="text-fine text-negative">{COUNT - withCount} argued back</span>
      </div>
    </div>
  );
}
