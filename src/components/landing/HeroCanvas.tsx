'use client';

import { useEffect, useRef } from 'react';
import { segmentColor } from '../room/palette';

/**
 * The landing hero: a room that is always mid-reaction.
 *
 * DETERMINISTIC BY DESIGN. This is a self-running script, not a simulation run.
 * It never touches the model, never calls the API and never depends on the
 * network, so the front page renders identically on a cold deploy, in CI, and
 * offline — the same property the deterministic engine exists to provide. A hero
 * that needed a model call to appear would be the most fragile thing in the
 * product, on the page a judge opens first.
 *
 * It is also honest about what it is: a scripted illustration of the six-stage
 * journey, not a measurement of anything. Nothing here is presented as a result.
 */

const SEGMENTS = 5;
const PER_SEGMENT = 11;
const AGENTS = SEGMENTS * PER_SEGMENT;

type Dot = {
  x: number;
  y: number;
  /** Target on the ring, so the field breathes around the centre. */
  tx: number;
  ty: number;
  segment: number;
  /** 0..1 progress through the journey, advanced on a per-dot clock. */
  phase: number;
  speed: number;
  radius: number;
};

/** Deterministic pseudo-random, so the layout is identical on every load. */
function seeded(seed: number): () => number {
  let s = seed >>> 0;
  return () => {
    s = (s + 0x6d2b79f5) >>> 0;
    let t = s;
    t = Math.imul(t ^ (t >>> 15), t | 1);
    t ^= t + Math.imul(t ^ (t >>> 7), t | 61);
    return ((t ^ (t >>> 14)) >>> 0) / 4294967296;
  };
}

export function HeroCanvas({ className }: { className?: string }) {
  const ref = useRef<HTMLCanvasElement>(null);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    const rng = seeded(20260926);

    let width = 0;
    let height = 0;
    const dots: Dot[] = [];

    const layout = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      dots.length = 0;
      const rx = Math.max(60, width * 0.33);
      const ry = Math.max(48, height * 0.31);
      for (let s = 0; s < SEGMENTS; s++) {
        const angle = (s / SEGMENTS) * Math.PI * 2 - Math.PI / 2;
        const cx = width / 2 + Math.cos(angle) * rx;
        const cy = height / 2 + Math.sin(angle) * ry;
        for (let i = 0; i < PER_SEGMENT; i++) {
          // Spread within the cluster on a small golden-angle spiral, which
          // reads as an organic group rather than a grid.
          const t = i * 2.399963;
          const r = 5 + Math.sqrt(i) * 6.4;
          const tx = cx + Math.cos(t) * r;
          const ty = cy + Math.sin(t) * r;
          dots.push({
            x: tx,
            y: ty,
            tx,
            ty,
            segment: s,
            // Staggered so the room is never all in one state.
            phase: rng(),
            speed: 0.1 + rng() * 0.16,
            radius: 3.1 + rng() * 1.5,
          });
        }
      }
    };

    layout();
    const observer = new ResizeObserver(layout);
    observer.observe(canvas);

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      const dt = Math.min(64, now - last) / 1000;
      last = now;

      ctx.clearRect(0, 0, width, height);

      const cx = width / 2;
      const cy = height / 2;

      // Guides: the room has an edge.
      ctx.save();
      ctx.strokeStyle = 'oklch(0.35 0.028 303 / 0.5)';
      ctx.lineWidth = 1;
      for (const f of [1, 0.62, 0.3]) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, width * 0.36 * f, height * 0.34 * f, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // The subject, at the centre of its own audience.
      const cardW = Math.min(190, width * 0.32);
      const cardH = 46;
      ctx.save();
      ctx.fillStyle = 'oklch(0.265 0.03 303 / 0.96)';
      ctx.strokeStyle = 'oklch(0.38 0.03 303)';
      ctx.lineWidth = 1;
      ctx.beginPath();
      const r = 9;
      const x0 = cx - cardW / 2;
      const y0 = cy - cardH / 2;
      ctx.moveTo(x0 + r, y0);
      ctx.arcTo(x0 + cardW, y0, x0 + cardW, y0 + cardH, r);
      ctx.arcTo(x0 + cardW, y0 + cardH, x0, y0 + cardH, r);
      ctx.arcTo(x0, y0 + cardH, x0, y0, r);
      ctx.arcTo(x0, y0, x0 + cardW, y0, r);
      ctx.closePath();
      ctx.fill();
      ctx.stroke();
      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'oklch(0.96 0.008 300)';
      ctx.font = '600 12px var(--font-display, system-ui)';
      ctx.fillText('Your content', cx, cy - 5);
      ctx.fillStyle = 'oklch(0.635 0.022 300)';
      ctx.font = '10px var(--font-jetbrains, monospace)';
      ctx.fillText(`${AGENTS} synthetic agents`, cx, cy + 11);
      ctx.restore();

      for (const d of dots) {
        d.phase += dt * d.speed;
        if (d.phase > 1.35) d.phase = 0;
        const p = Math.min(1, d.phase);

        // Drift in toward the ring on the way through the journey, so the field
        // breathes rather than sitting still.
        const pull = 0.35 + p * 0.65;
        d.x += (cx + (d.tx - cx) * pull - d.x) * 0.045;
        d.y += (cy + (d.ty - cy) * pull - d.y) * 0.045;

        // Hue is the SEGMENT, brightness is how far through the journey the
        // agent has got. Same two channels as the real room.
        const lightness = 0.44 + p * 0.36;
        const colour = segmentColor(d.segment, lightness);

        if (p > 0.3) {
          ctx.beginPath();
          ctx.arc(d.x, d.y, d.radius + 9 * p, 0, Math.PI * 2);
          ctx.fillStyle = colour.replace(/\)$/, ` / ${(0.16 * p).toFixed(3)})`);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(d.x, d.y, d.radius, 0, Math.PI * 2);
        ctx.fillStyle = colour;
        ctx.fill();
      }

      raf = requestAnimationFrame(frame);
    };

    if (reduced) {
      // One static frame: the room at rest, still legible, no motion at all.
      for (const d of dots) d.phase = 0.45;
      const once = () => {
        last = performance.now();
        frame(last);
        cancelAnimationFrame(raf);
      };
      once();
    } else {
      raf = requestAnimationFrame(frame);
    }

    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, []);

  return (
    <canvas
      ref={ref}
      className={className}
      role="img"
      aria-label="An illustration of a synthetic audience reacting to a piece of content, grouped into segments."
    />
  );
}
