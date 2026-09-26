'use client';

import { useEffect, useMemo, useRef } from 'react';
import {
  forceCenter,
  forceCollide,
  forceManyBody,
  forceSimulation,
  forceX,
  forceY,
  type Simulation,
  type SimulationNodeDatum,
} from 'd3-force';
import type { JourneyStage, ReactionAction } from '../../core/domain';
import { agentList, stageCounts, actionCounts, type RunViewState } from '../../lib/run-reducer';
import { cn } from '../../lib/cn';
import { Panel, PanelHeader } from '../ui';
import { ACTION_COLORS, STAGE_LEGEND, colorForAgent } from './stage-colors';

/**
 * The Room — the visual centrepiece.
 *
 * Canvas rather than DOM: 24-100 nodes at 60fps would mean 100 elements
 * re-laying out per frame. d3-force computes the layout; a single rAF loop draws
 * it. Only `d3-force` is imported (never the full d3 bundle).
 *
 * THREE ENCODING CHANNELS, and no more (docs/ui-ux.md §5):
 *   fill       → journey stage (valence colour once the agent has acted)
 *   halo       → reaction intensity
 *   proximity  → segment grouping
 *
 * Everything else is suppressed on purpose. Extra decoration would make the room
 * look busier while telling the viewer less.
 *
 * Motion is decorative: with prefers-reduced-motion the layout still settles but
 * nodes do not pulse, and the reaction feed carries the narrative instead.
 */

type Node = SimulationNodeDatum & {
  id: string;
  label: string;
  segmentIndex: number;
  segmentCount: number;
  stage: JourneyStage;
  action: ReactionAction | null;
  intensity: number;
  /** Sequence of the event that last changed this node's action. */
  actionSeq: number;
  pulseAt: number;
};

const RADIUS = 5.5;
const MAX_HALO = 13;

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

export function TheRoom({ state, className }: { state: RunViewState; className?: string }) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const simRef = useRef<Simulation<Node, undefined> | null>(null);
  const rafRef = useRef<number | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });

  const agents = useMemo(() => agentList(state), [state]);
  const segments = state.audience?.segments ?? [];

  const segmentIndex = useMemo(() => {
    const map = new Map<string, number>();
    segments.forEach((s, i) => map.set(s.id, i));
    return map;
  }, [segments]);

  // ---- sync the node set with the event-derived state ----------------------
  useEffect(() => {
    const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
    const count = Math.max(1, segments.length);

    const next: Node[] = agents.map((a) => {
      const existing = byId.get(a.agentId);
      const segIdx = segmentIndex.get(a.segmentId) ?? 0;
      if (existing) {
        // Detect an action CHANGE, not merely a non-null action, so a node
        // pulses once when it acts rather than every frame afterwards.
        const changed = a.action !== null && a.seq !== existing.actionSeq && a.action !== existing.action;
        if (changed) existing.pulseAt = performance.now();
        existing.stage = a.stage;
        existing.action = a.action;
        existing.intensity = a.intensity;
        existing.actionSeq = a.seq;
        existing.segmentIndex = segIdx;
        existing.segmentCount = count;
        return existing;
      }
      return {
        id: a.agentId,
        label: a.label,
        segmentIndex: segIdx,
        segmentCount: count,
        stage: a.stage,
        action: a.action,
        intensity: a.intensity,
        actionSeq: a.seq,
        pulseAt: 0,
      };
    });

    nodesRef.current = next;
  }, [agents, segmentIndex, segments.length]);

  // ---- simulation lifecycle ------------------------------------------------
  useEffect(() => {
    const sim = forceSimulation<Node>(nodesRef.current)
      .force('charge', forceManyBody<Node>().strength(-28))
      .force('collide', forceCollide<Node>(RADIUS * 2.6))
      // Weak pull toward the segment's own centroid: proximity reads as
      // grouping without drawing a hard boundary or a label.
      .force('x', forceX<Node>((d) => centroid(d, 'x')).strength(0.06))
      .force('y', forceY<Node>((d) => centroid(d, 'y')).strength(0.06))
      .alphaDecay(0.035)
      .velocityDecay(0.42);

    simRef.current = sim;
    return () => {
      sim.stop();
      simRef.current = null;
    };
  }, []);

  useEffect(() => {
    const sim = simRef.current;
    if (!sim) return;
    sim.nodes(nodesRef.current);
    sim.alpha(0.6).restart();
  }, [agents.length, segments.length]);

  // ---- render loop ---------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = prefersReducedMotion();

    // `paint` renders a single frame. It is deliberately separate from the rAF
    // loop so `resize` can repaint synchronously: resizing the canvas clears it,
    // and waiting for the next animation frame left a visibly blank room for one
    // frame on every resize.
    const paint = () => {
      const { width, height } = sizeRef.current;
      if (width === 0 || height === 0) return;
      const cx = width / 2;
      const cy = height / 2;
      const now = performance.now();

      ctx.clearRect(0, 0, width, height);

      // The content sits at the centre: the room surrounds its subject.
      const cardW = Math.min(180, width * 0.34);
      const cardH = 52;
      ctx.save();
      ctx.fillStyle = 'oklch(0.22 0.008 260)';
      ctx.strokeStyle = 'oklch(0.34 0.01 260)';
      ctx.lineWidth = 1;
      roundRect(ctx, cx - cardW / 2, cy - cardH / 2, cardW, cardH, 7);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';
      ctx.fillStyle = 'oklch(0.97 0.002 260)';
      ctx.font = '600 11px ui-sans-serif, system-ui, sans-serif';
      ctx.fillText(state.pass === 'B' ? 'VERSION B' : 'CONTENT', cx, cy - 8);
      ctx.fillStyle = 'oklch(0.72 0.006 260)';
      ctx.font = '9px ui-monospace, monospace';
      ctx.fillText(`${agents.length} synthetic agents`, cx, cy + 9);
      ctx.restore();

      for (const node of nodesRef.current) {
        if (node.x === undefined || node.y === undefined) continue;
        const color = colorForAgent(node.stage, node.action);

        // Halo = intensity. Only meaningful once an agent is reacting.
        if (node.intensity > 0.05) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, RADIUS + MAX_HALO * node.intensity, 0, Math.PI * 2);
          ctx.fillStyle = withAlpha(color, 0.1 + 0.16 * node.intensity);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, RADIUS, 0, Math.PI * 2);
        ctx.fillStyle = color;
        ctx.fill();

        // A single 400ms ring pulse on action, then it settles. Longer or
        // repeated motion would read as chaos rather than as a reaction.
        if (!reduced && node.pulseAt > 0) {
          const age = now - node.pulseAt;
          if (age < 400) {
            const t = age / 400;
            ctx.beginPath();
            ctx.arc(node.x, node.y, RADIUS + 2 + t * 16, 0, Math.PI * 2);
            ctx.strokeStyle = withAlpha(color, (1 - t) * 0.7);
            ctx.lineWidth = 1.4;
            ctx.stroke();
          } else {
            node.pulseAt = 0;
          }
        }
      }
    };

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      sizeRef.current = { width: rect.width, height: rect.height };
      canvas.width = Math.floor(rect.width * dpr);
      canvas.height = Math.floor(rect.height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);

      const sim = simRef.current;
      if (sim) {
        sim.force('center', forceCenter(rect.width / 2, rect.height / 2));
        sim.alpha(0.4).restart();
      }
      // Repaint now, so the cleared canvas is never visible.
      paint();
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const loop = () => {
      paint();
      rafRef.current = requestAnimationFrame(loop);
    };
    rafRef.current = requestAnimationFrame(loop);

    return () => {
      observer.disconnect();
      if (rafRef.current !== null) cancelAnimationFrame(rafRef.current);
      rafRef.current = null;
    };
  }, [agents.length, state.pass]);

  const counts = useMemo(() => stageCounts(state), [state]);
  const actions = useMemo(() => actionCounts(state), [state]);

  return (
    <Panel className={cn('flex min-h-0 flex-col overflow-hidden', className)}>
      <PanelHeader
        title={state.pass === 'B' ? 'The room is live — Version B' : 'The room is live'}
        meta={
          state.ofRounds > 0 ? `round ${state.round}/${state.ofRounds}` : 'waiting to start'
        }
        event={state.pass === 'B' ? 'resim_event' : 'agent_event'}
      />

      <div className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className="grid-field h-full w-full"
          style={{ minHeight: 300 }}
          aria-label={`Room view: ${agents.length} synthetic audience agents across six journey stages.`}
          role="img"
        />
      </div>

      {/* Counters: the numeric reading of what the room is doing. */}
      <div className="grid grid-cols-3 gap-x-4 gap-y-2 border-t border-line-soft px-4 py-2.5 sm:grid-cols-6">
        {STAGE_LEGEND.map(({ stage, label }) => (
          <div key={stage} className="min-w-0">
            <div className="micro truncate">{label}</div>
            <div className="tabular text-sm">{counts[stage]}</div>
          </div>
        ))}
      </div>

      {/* Action tally — the reaction mix as it forms. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft px-4 py-2">
        <span className="micro">actions</span>
        {Object.keys(ACTION_COLORS)
          .filter((a) => (actions[a] ?? 0) > 0)
          .map((a) => (
            <span key={a} className="flex items-baseline gap-1">
              <span
                className="font-mono text-3xs uppercase tracking-wider"
                style={{ color: ACTION_COLORS[a] }}
              >
                {a}
              </span>
              <span className="tabular text-3xs text-muted">{actions[a]}</span>
            </span>
          ))}
        {Object.values(actions).every((n) => n === 0) ? (
          <span className="micro">no actions yet</span>
        ) : null}
      </div>

      <p className="border-t border-line-soft px-4 py-2 note">
        Colour is stage, halo is intensity, proximity is segment grouping.
      </p>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

/** Segment centroid: agents orbit their own segment's arc of the circle. */
function centroid(node: Node, axis: 'x' | 'y'): number {
  const canvas = typeof document !== 'undefined' ? document.querySelector('canvas') : null;
  const rect = canvas?.getBoundingClientRect();
  const width = rect?.width ?? 600;
  const height = rect?.height ?? 360;
  const angle = (node.segmentIndex / Math.max(1, node.segmentCount)) * Math.PI * 2 - Math.PI / 2;
  const radiusX = width * 0.3;
  const radiusY = height * 0.3;
  return axis === 'x'
    ? width / 2 + Math.cos(angle) * radiusX
    : height / 2 + Math.sin(angle) * radiusY;
}

function roundRect(
  ctx: CanvasRenderingContext2D,
  x: number,
  y: number,
  w: number,
  h: number,
  r: number,
): void {
  ctx.beginPath();
  ctx.moveTo(x + r, y);
  ctx.arcTo(x + w, y, x + w, y + h, r);
  ctx.arcTo(x + w, y + h, x, y + h, r);
  ctx.arcTo(x, y + h, x, y, r);
  ctx.arcTo(x, y, x + w, y, r);
  ctx.closePath();
}

/**
 * Apply an alpha to an OKLCH colour string.
 * Canvas does not accept `color-mix`, so the alpha is composed directly.
 */
function withAlpha(color: string, alpha: number): string {
  const clamped = Math.max(0, Math.min(1, alpha));
  if (color.startsWith('oklch(')) {
    return color.replace(/\)$/, ` / ${clamped.toFixed(3)})`);
  }
  return color;
}
