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
import {
  CONTENT_KIND_LABELS,
  type ContentAsset,
  type JourneyStage,
  type ReactionAction,
} from '../../core/domain';
import { agentList, stageCounts, actionCounts, type RunViewState } from '../../lib/run-reducer';
import { cn } from '../../lib/cn';
import { Panel, PanelHeader } from '../ui';
import { STAGE_LEGEND } from './stage-colors';
import { segmentColor, segmentIndexer } from './palette';

/**
 * The Room.
 *
 * Canvas rather than DOM: 24-100 nodes at 60fps would mean 100 elements
 * re-laying out per frame. d3-force computes the layout; a single rAF loop draws
 * it. Only `d3-force` is imported — never the full d3 bundle.
 *
 * THREE ENCODING CHANNELS, and no more:
 *   hue        → segment (the same palette used everywhere else)
 *   brightness → how far through the journey the agent has got
 *   halo       → reaction intensity, tinted by valence
 *
 * The earlier version coloured by stage alone, which meant the audience read as
 * one undifferentiated mass and the question "which group is objecting?" — the
 * question a user actually has — could not be answered by looking.
 *
 * Agents are arranged in a ring of segment clusters around the content, so the
 * content sits at the centre of its own audience. Clicking an agent selects it
 * for the inspector.
 */

type Node = SimulationNodeDatum & {
  id: string;
  label: string;
  segmentIndex: number;
  segmentCount: number;
  stage: JourneyStage;
  action: ReactionAction | null;
  intensity: number;
  actionSeq: number;
  pulseAt: number;
};

const MAX_HALO = 12;

/**
 * Node size by population.
 *
 * With 100 agents a fixed 5px radius plus an 11px collision radius merges every
 * cluster into one solid blob, so the room stops communicating groups at exactly
 * the point where grouping matters most. Nodes shrink and the halo shortens as
 * the population grows.
 */
function sizing(population: number): { radius: number; collide: number; halo: number } {
  if (population > 72) return { radius: 3.4, collide: 8.2, halo: 8 };
  if (population > 40) return { radius: 4.2, collide: 10, halo: 10 };
  return { radius: 5, collide: 11, halo: MAX_HALO };
}

/** Brightness by journey stage: dim while watching, full when they have acted. */
const STAGE_LIGHTNESS: Record<JourneyStage, number> = {
  exposure: 0.42,
  attention: 0.55,
  interpretation: 0.66,
  response: 0.74,
  decision: 0.82,
  action: 0.78,
};

const NEGATIVE_ACTIONS = new Set<ReactionAction>(['REJECT', 'IGNORE', 'STOP']);

function prefersReducedMotion(): boolean {
  if (typeof window === 'undefined') return false;
  return window.matchMedia('(prefers-reduced-motion: reduce)').matches;
}

/** Ring geometry, shared by the force targets and the guide circles. */
function ringRadius(width: number, height: number): number {
  // Elliptical, so a wide canvas spreads the audience sideways instead of
  // crowding every cluster into the middle third.
  return Math.max(70, Math.min(width * 0.36, height * 0.36));
}

function clusterCenter(
  index: number,
  count: number,
  width: number,
  height: number,
): { x: number; y: number } {
  const angle = (index / Math.max(1, count)) * Math.PI * 2 - Math.PI / 2;
  // Horizontal radius is allowed to exceed the vertical one on wide canvases.
  const rx = Math.max(70, width * 0.34);
  const ry = Math.max(60, height * 0.32);
  void ringRadius(width, height);
  return {
    x: width / 2 + Math.cos(angle) * rx,
    y: height / 2 + Math.sin(angle) * ry,
  };
}

export function TheRoom({
  state,
  selectedAgentId,
  onSelectAgent,
  className,
}: {
  state: RunViewState;
  selectedAgentId?: string | null;
  onSelectAgent?: (agentId: string) => void;
  className?: string;
}) {
  const canvasRef = useRef<HTMLCanvasElement>(null);
  const nodesRef = useRef<Node[]>([]);
  const simRef = useRef<Simulation<Node, undefined> | null>(null);
  const rafRef = useRef<number | null>(null);
  const sizeRef = useRef({ width: 0, height: 0 });
  // Read inside the render loop without restarting it on every selection change.
  const selectedRef = useRef<string | null>(null);
  /** Node sizing for the current population, read by the forces and the painter. */
  const sizingRef = useRef(sizing(24));

  const agents = useMemo(() => agentList(state), [state]);
  const segments = state.audience?.segments ?? [];
  const asset: ContentAsset | null = state.asset;

  const segmentIndex = useMemo(
    () => segmentIndexer(segments.map((s) => s.id)),
    [segments],
  );

  useEffect(() => {
    selectedRef.current = selectedAgentId ?? null;
  }, [selectedAgentId]);

  useEffect(() => {
    sizingRef.current = sizing(agents.length);
  }, [agents.length]);

  // ---- sync the node set with the event-derived state ----------------------
  useEffect(() => {
    const byId = new Map(nodesRef.current.map((n) => [n.id, n]));
    const count = Math.max(1, segments.length);

    nodesRef.current = agents.map((a) => {
      const existing = byId.get(a.agentId);
      const segIdx = segmentIndex(a.segmentId);
      if (existing) {
        // Pulse once when an action CHANGES, not every frame while it persists.
        const changed =
          a.action !== null && a.seq !== existing.actionSeq && a.action !== existing.action;
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
  }, [agents, segmentIndex, segments.length]);

  // ---- simulation lifecycle ------------------------------------------------
  useEffect(() => {
    // The cluster target is read from the live canvas size on every tick, so the
    // layout stays correct across resizes without recomputing the forces.
    const toCluster = (node: Node, axis: 'x' | 'y'): number => {
      const { width, height } = sizeRef.current;
      const c = clusterCenter(node.segmentIndex, node.segmentCount, width || 600, height || 400);
      return axis === 'x' ? c.x : c.y;
    };

    const sim = forceSimulation<Node>(nodesRef.current)
      // Weak global repulsion: enough to stop overlap, not enough to break a
      // cluster apart.
      .force('charge', forceManyBody<Node>().strength(-14))
      .force('collide', forceCollide<Node>(() => sizingRef.current.collide))
      // Strong pull to the segment's own point on the ring. This is what makes
      // the room read as groups rather than as a cloud.
      .force('x', forceX<Node>((d) => toCluster(d, 'x')).strength(0.18))
      .force('y', forceY<Node>((d) => toCluster(d, 'y')).strength(0.18))
      .alphaDecay(0.03)
      .velocityDecay(0.4);

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
    sim.alpha(0.7).restart();
  }, [agents.length, segments.length]);

  // ---- render loop ---------------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = prefersReducedMotion();

    const paint = () => {
      const { width, height } = sizeRef.current;
      if (width === 0 || height === 0) return;

      const cx = width / 2;
      const cy = height / 2;
      const now = performance.now();
      const size = sizingRef.current;

      ctx.clearRect(0, 0, width, height);

      // Concentric guides: the room has an edge, and the audience sits inside it.
      ctx.save();
      ctx.strokeStyle = 'oklch(0.30 0.008 260 / 0.5)';
      ctx.lineWidth = 1;
      const rxGuide = Math.max(70, width * 0.34);
      const ryGuide = Math.max(60, height * 0.32);
      for (const factor of [1, 0.62, 0.3]) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, rxGuide * factor, ryGuide * factor, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // Faint spoke from the centre to each cluster, so a group is anchored.
      ctx.save();
      ctx.strokeStyle = 'oklch(0.30 0.008 260 / 0.35)';
      ctx.lineWidth = 1;
      segments.forEach((_, i) => {
        const c = clusterCenter(i, Math.max(1, segments.length), width, height);
        ctx.beginPath();
        ctx.moveTo(cx, cy);
        ctx.lineTo(c.x, c.y);
        ctx.stroke();
      });
      ctx.restore();

      // ---- the content, at the centre of its own audience -------------------
      const cardW = Math.min(220, width * 0.42);
      const cardH = 62;
      ctx.save();
      ctx.fillStyle = 'oklch(0.21 0.008 260 / 0.95)';
      ctx.strokeStyle = 'oklch(0.36 0.01 260)';
      ctx.lineWidth = 1;
      roundRect(ctx, cx - cardW / 2, cy - cardH / 2, cardW, cardH, 8);
      ctx.fill();
      ctx.stroke();

      ctx.textAlign = 'center';
      ctx.textBaseline = 'middle';

      ctx.fillStyle = 'oklch(0.97 0.002 260)';
      ctx.font = '600 12px ui-sans-serif, system-ui, sans-serif';
      const title = fit(ctx, asset?.title?.trim() || 'Untitled content', cardW - 24);
      ctx.fillText(title, cx, cy - 12);

      ctx.fillStyle = 'oklch(0.68 0.006 260)';
      ctx.font = '9px ui-monospace, monospace';
      const meta = `${asset ? CONTENT_KIND_LABELS[asset.kind] : 'Content'} · ${agents.length} agents${
        state.pass === 'B' ? ' · VERSION B' : ''
      }`;
      ctx.fillText(fit(ctx, meta, cardW - 24), cx, cy + 6);

      // Version B is a state, not a footnote.
      if (state.pass === 'B') {
        ctx.fillStyle = 'oklch(0.72 0.15 250)';
        ctx.font = '600 8px ui-monospace, monospace';
        ctx.fillText('RE-TEST', cx, cy + 21);
      }
      ctx.restore();

      // ---- the agents -------------------------------------------------------
      for (const node of nodesRef.current) {
        if (node.x === undefined || node.y === undefined) continue;

        const hue = segmentColor(node.segmentIndex, STAGE_LIGHTNESS[node.stage]);
        const acted = node.stage === 'action' && node.action !== null;
        // Only REJECT is alarming. STOP and IGNORE mean "not engaged", which is
        // the ordinary fate of most content — rendering them in the same red as
        // an active rejection made a merely-ignored piece look like a disaster,
        // and 16 of 24 agents stopping to read nothing else is a normal result.
        const rejected = node.action === 'REJECT';
        const disengaged = acted && (node.action === 'IGNORE' || node.action === 'STOP');
        const selected = node.id === selectedRef.current;

        // Halo = intensity. Rejection glows red; everything else uses its
        // segment hue, so disagreement is visible without reading anything.
        if (node.intensity > 0.05) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, size.radius + size.halo * node.intensity, 0, Math.PI * 2);
          ctx.fillStyle = rejected
            ? `oklch(0.62 0.19 25 / ${(0.12 + 0.18 * node.intensity).toFixed(3)})`
            : withAlpha(hue, 0.08 + 0.14 * node.intensity);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(node.x, node.y, size.radius, 0, Math.PI * 2);
        if (rejected) ctx.fillStyle = 'oklch(0.68 0.17 25)';
        // Disengaged agents are grey, not coloured: they left the journey, so
        // they should recede rather than compete with the agents still reacting.
        else if (disengaged) ctx.fillStyle = `oklch(0.5 0.02 260)`;
        else ctx.fillStyle = hue;
        ctx.fill();

        if (selected) {
          ctx.beginPath();
          ctx.arc(node.x, node.y, size.radius + 4, 0, Math.PI * 2);
          ctx.strokeStyle = 'oklch(0.97 0.002 260)';
          ctx.lineWidth = 1.6;
          ctx.stroke();
        }

        // One 400ms ring pulse on action, then it settles. Longer or repeated
        // motion reads as chaos rather than as a reaction.
        if (!reduced && node.pulseAt > 0) {
          const age = now - node.pulseAt;
          if (age < 400) {
            const t = age / 400;
            ctx.beginPath();
            ctx.arc(node.x, node.y, size.radius + 2 + t * 14, 0, Math.PI * 2);
            ctx.strokeStyle = withAlpha(hue, (1 - t) * 0.7);
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
      // Repaint immediately: resizing clears the canvas, and waiting for the
      // next frame left a visibly blank room.
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
  }, [agents.length, state.pass, segments.length, asset?.title, asset?.kind]);

  // ---- click to inspect ----------------------------------------------------
  useEffect(() => {
    const canvas = canvasRef.current;
    if (!canvas || !onSelectAgent) return;

    const onClick = (event: MouseEvent) => {
      const rect = canvas.getBoundingClientRect();
      const x = event.clientX - rect.left;
      const y = event.clientY - rect.top;
      let best: { id: string; distance: number } | null = null;
      for (const node of nodesRef.current) {
        if (node.x === undefined || node.y === undefined) continue;
        const distance = Math.hypot(node.x - x, node.y - y);
        if (distance <= 18 && (!best || distance < best.distance)) {
          best = { id: node.id, distance };
        }
      }
      if (best) onSelectAgent(best.id);
    };

    canvas.addEventListener('click', onClick);
    return () => canvas.removeEventListener('click', onClick);
  }, [onSelectAgent]);

  const counts = useMemo(() => stageCounts(state), [state]);
  const actions = useMemo(() => actionCounts(state), [state]);

  return (
    <Panel className={cn('flex min-h-0 flex-col overflow-hidden', className)}>
      <PanelHeader
        title={state.pass === 'B' ? 'The room is live — Version B' : 'The room is live'}
        meta={
          state.ofRounds > 0
            ? `round ${state.round}/${state.ofRounds} · click an agent to inspect`
            : 'waiting to start'
        }
        event={state.pass === 'B' ? 'resim_event' : 'agent_event'}
      />

      <div className="relative min-h-0 flex-1">
        <canvas
          ref={canvasRef}
          className="grid-field h-full w-full"
          style={{ minHeight: 320, cursor: onSelectAgent ? 'pointer' : 'default' }}
          aria-label={`Room view: ${agents.length} synthetic audience agents in ${segments.length} segment clusters.`}
          role="img"
        />
      </div>

      {/* Segment legend: hue is the only channel that needs decoding. */}
      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft px-4 py-2">
        <span className="micro">segments</span>
        {segments.map((s, i) => (
          <span key={s.id} className="flex items-center gap-1.5">
            <span
              className="size-2 rounded-full"
              style={{ background: segmentColor(i) }}
              aria-hidden
            />
            <span className="text-3xs text-muted">{s.label}</span>
          </span>
        ))}
      </div>

      <div className="grid grid-cols-3 gap-x-4 gap-y-2 border-t border-line-soft px-4 py-2.5 sm:grid-cols-6">
        {STAGE_LEGEND.map(({ stage, label }) => (
          <div key={stage} className="min-w-0">
            <div className="micro truncate">{label}</div>
            <div className="tabular text-sm">{counts[stage]}</div>
          </div>
        ))}
      </div>

      <div className="flex flex-wrap items-center gap-x-3 gap-y-1 border-t border-line-soft px-4 py-2">
        <span className="micro">actions</span>
        {Object.entries(actions)
          .filter(([, n]) => n > 0)
          .map(([a, n]) => (
            <span key={a} className="flex items-baseline gap-1">
              <span
                className={cn(
                  'font-mono text-3xs uppercase tracking-wider',
                  NEGATIVE_ACTIONS.has(a as ReactionAction) ? 'text-negative' : 'text-positive',
                )}
              >
                {a}
              </span>
              <span className="tabular text-3xs text-muted">{n}</span>
            </span>
          ))}
        {Object.values(actions).every((n) => n === 0) ? (
          <span className="micro">no actions yet</span>
        ) : null}
      </div>
    </Panel>
  );
}

// ---------------------------------------------------------------------------

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

/** Truncate to fit a measured width, with an ellipsis. */
function fit(ctx: CanvasRenderingContext2D, text: string, maxWidth: number): string {
  if (ctx.measureText(text).width <= maxWidth) return text;
  let out = text;
  while (out.length > 4 && ctx.measureText(`${out}…`).width > maxWidth) {
    out = out.slice(0, -1);
  }
  return `${out}…`;
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
