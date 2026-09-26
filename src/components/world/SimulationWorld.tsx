'use client';

import { useEffect, useMemo, useRef, useState } from 'react';
import {
  CONTENT_KIND_LABELS,
  type ContentAsset,
  type JourneyStage,
  type ReactionAction,
} from '../../core/domain';
import { agentList, type RunViewState } from '../../lib/run-reducer';
import { cn } from '../../lib/cn';
import { segmentColor, segmentIndexer, reactionColorFor, withAlpha } from '../room/palette';
import { MetricBar, MetricChip, SegmentedBar, StatusPill, Tag, WorldCallout } from './parts';

/**
 * The simulation world.
 *
 * The canvas is the page. Agents are grouped in segment clusters on a ring with
 * the content at the centre, so the thing being examined sits literally inside
 * its own audience — which is the product's argument, made spatial.
 *
 * Three encoding channels and no more:
 *   hue        → segment (or reaction, in Heatmap)
 *   brightness → how far through the journey the agent has got
 *   halo       → reaction intensity
 *
 * The content card, the status pill and the finding callout are HTML overlays
 * rather than canvas draws: crisp text at any zoom, selectable, and announced to
 * a screen reader. Drawing them into the canvas would have been simpler and
 * worse.
 */

type WorldNode = {
  x: number;
  y: number;
  segmentIndex: number;
  stage: JourneyStage;
  action: ReactionAction | null;
  intensity: number;
  phase: number;
};

type ViewMode = 'clusters' | 'agents' | 'heatmap';

const STAGE_LIGHTNESS: Record<JourneyStage, number> = {
  exposure: 0.46,
  attention: 0.56,
  interpretation: 0.66,
  response: 0.74,
  decision: 0.82,
  action: 0.78,
};

export function SimulationWorld({
  state,
  selectedAgentId,
  onSelectAgent,
  onInspect,
  className,
}: {
  state: RunViewState;
  selectedAgentId: string | null;
  onSelectAgent: (id: string) => void;
  onInspect: () => void;
  className?: string;
}) {
  const ref = useRef<HTMLCanvasElement>(null);
  const [mode, setMode] = useState<ViewMode>('clusters');
  const nodesRef = useRef<WorldNode[]>([]);
  const selectedRef = useRef<string | null>(null);
  const modeRef = useRef<ViewMode>('clusters');

  const agents = useMemo(() => agentList(state), [state]);
  const segments = state.audience?.segments ?? [];
  const asset: ContentAsset | null = state.asset;
  const segmentIndex = useMemo(() => segmentIndexer(segments.map((s) => s.id)), [segments]);

  useEffect(() => {
    selectedRef.current = selectedAgentId ?? null;
  }, [selectedAgentId]);
  useEffect(() => {
    modeRef.current = mode;
  }, [mode]);

  // Sync the node set from the event-derived state. Order and count are stable,
  // so each agent keeps its position across re-renders.
  useEffect(() => {
    const existing = nodesRef.current;
    nodesRef.current = agents.map((a, i) => {
      const prev = existing[i];
      return {
        x: prev?.x ?? 0,
        y: prev?.y ?? 0,
        segmentIndex: segmentIndex(a.segmentId),
        stage: a.stage,
        action: a.action,
        intensity: a.intensity,
        phase: prev?.phase ?? 0.5,
      };
    });
  }, [agents, segmentIndex]);

  useEffect(() => {
    const canvas = ref.current;
    if (!canvas) return;
    const ctx = canvas.getContext('2d');
    if (!ctx) return;

    const reduced = window.matchMedia('(prefers-reduced-motion: reduce)').matches;
    let width = 0;
    let height = 0;

    const resize = () => {
      const rect = canvas.getBoundingClientRect();
      const dpr = Math.min(2, window.devicePixelRatio || 1);
      width = rect.width;
      height = rect.height;
      canvas.width = Math.floor(width * dpr);
      canvas.height = Math.floor(height * dpr);
      ctx.setTransform(dpr, 0, 0, dpr, 0, 0);
      // Seed any uninitialised nodes into their cluster so the first frame is
      // already grouped rather than collapsing inward.
      const n = nodesRef.current.length;
      const rx = width * 0.3;
      const ry = height * 0.3;
      const segs = Math.max(1, segments.length);
      nodesRef.current.forEach((node, i) => {
        if (node.x !== 0 || node.y !== 0) return;
        const angle = (node.segmentIndex / segs) * Math.PI * 2 - Math.PI / 2;
        const t = i * 2.399963;
        const r = 4 + Math.sqrt(i % 14) * 5.6;
        node.x = width / 2 + Math.cos(angle) * rx + Math.cos(t) * r;
        node.y = height / 2 + Math.sin(angle) * ry + Math.sin(t) * r;
      });
    };

    resize();
    const observer = new ResizeObserver(resize);
    observer.observe(canvas);

    const size = () => {
      const aw = Math.max(3, Math.min(5.4, 46 / Math.max(1, Math.sqrt(nodesRef.current.length))));
      return { r: aw, halo: aw * 2.6 };
    };

    let raf = 0;
    let last = performance.now();

    const frame = (now: number) => {
      // The reschedule lives in `finally`, so one bad frame cannot silently kill
      // the loop and leave a frozen canvas.
      try {
      const dt = Math.min(64, now - last) / 1000;
      last = now;
      const s = size();
      const cx = width / 2;
      const cy = height / 2;
      const segs = Math.max(1, segments.length);
      const node = nodesRef.current;

      ctx.clearRect(0, 0, width, height);

      // Guides: the ring has an edge.
      ctx.save();
      ctx.strokeStyle = 'oklch(0.35 0.028 303 / 0.42)';
      ctx.lineWidth = 1;
      for (const f of [1, 0.62, 0.3]) {
        ctx.beginPath();
        ctx.ellipse(cx, cy, width * 0.32 * f, height * 0.32 * f, 0, 0, Math.PI * 2);
        ctx.stroke();
      }
      ctx.restore();

      // Cluster glows first, under everything, so groups read as masses.
      if (modeRef.current !== 'agents') {
        ctx.save();
        for (let i = 0; i < segs; i++) {
          const angle = (i / segs) * Math.PI * 2 - Math.PI / 2;
          const gx = cx + Math.cos(angle) * width * 0.3;
          const gy = cy + Math.sin(angle) * height * 0.3;
          const grad = ctx.createRadialGradient(gx, gy, 0, gx, gy, s.halo * 5.5);
          grad.addColorStop(0, withAlpha(segmentColor(i, 0.7), 0.14));
          grad.addColorStop(1, withAlpha(segmentColor(i, 0.7), 0));
          ctx.fillStyle = grad;
          ctx.beginPath();
          ctx.arc(gx, gy, s.halo * 5.5, 0, Math.PI * 2);
          ctx.fill();
        }
        ctx.restore();
      }

      for (let i = 0; i < node.length; i++) {
        const d = node[i];
        if (!d) continue;

        if (modeRef.current === 'agents') {
          // Free layout: spread by index on a golden spiral, drifting slowly.
          d.phase += dt * 0.08;
          const t = i * 2.399963;
          const rr = Math.sqrt(i + 1) * (Math.min(width, height) * 0.028);
          const tx = cx + Math.cos(t + d.phase * 0.15) * rr;
          const ty = cy + Math.sin(t + d.phase * 0.15) * rr;
          d.x += (tx - d.x) * 0.05;
          d.y += (ty - d.y) * 0.05;
        } else {
          const angle = (d.segmentIndex / segs) * Math.PI * 2 - Math.PI / 2;
          const t = i * 2.399963;
          const rr = 4 + Math.sqrt(i % 16) * 5.4;
          const rx = width * 0.3;
          const ry = height * 0.3;
          const tx = cx + Math.cos(angle) * rx + Math.cos(t) * rr;
          const ty = cy + Math.sin(angle) * ry + Math.sin(t) * rr;
          const pull = 0.055;
          d.x += (tx - d.x) * pull;
          d.y += (ty - d.y) * pull;
        }

        const colour =
          modeRef.current === 'heatmap'
            ? reactionColorFor(d.action)
            : segmentColor(d.segmentIndex, STAGE_LIGHTNESS[d.stage]);

        // Halo carries intensity. In Heatmap the whole point is density, so the
        // halo is drawn for every agent rather than only the reacting ones.
        const halo = modeRef.current === 'heatmap' ? Math.max(0.25, d.intensity) : d.intensity;
        if (halo > 0.05) {
          ctx.beginPath();
          ctx.arc(d.x, d.y, s.r + s.halo * halo, 0, Math.PI * 2);
          ctx.fillStyle =
            d.action === 'REJECT'
              ? `oklch(0.65 0.155 30 / ${(0.1 + 0.16 * halo).toFixed(3)})`
              : withAlpha(colour, 0.08 + 0.14 * halo);
          ctx.fill();
        }

        ctx.beginPath();
        ctx.arc(d.x, d.y, s.r, 0, Math.PI * 2);
        ctx.fillStyle = colour;
        ctx.fill();
      }

      // Selection ring drawn last so it sits above every neighbour.
      const selIdx = agents.findIndex((a) => a.agentId === selectedRef.current);
      const sel = selIdx >= 0 ? node[selIdx] : undefined;
      if (sel) {
        ctx.beginPath();
        ctx.arc(sel.x, sel.y, s.r + 5, 0, Math.PI * 2);
        ctx.strokeStyle = 'oklch(0.97 0.004 300)';
        ctx.lineWidth = 1.6;
        ctx.stroke();
      }

      } finally {
        if (!reduced) raf = requestAnimationFrame(frame);
      }
    };

    /**
     * Draw one frame SYNCHRONOUSLY before starting the loop.
     *
     * Browsers suspend requestAnimationFrame entirely in a backgrounded tab, so
     * a canvas that only ever paints inside a RAF callback renders blank until
     * the tab is looked at — which is also what a screenshot or an automated
     * check sees. Painting once here means the world is never empty.
     */
    frame(performance.now());
    return () => {
      observer.disconnect();
      cancelAnimationFrame(raf);
    };
  }, [segments.length, agents]);

  // ---- the numbers shown on the card and the bars --------------------------
  const metrics = state.metricsA;
  const value = (id: string) => metrics?.overall.find((m) => m.id === id)?.value ?? 0;
  const attention = value('attention');
  const trust = value('trust');
  const share = value('shareIntent');

  const finding = state.why?.topFrictions[0] ?? null;
  const rejected = metrics?.bookkeeping.actionCounts.REJECT ?? 0;
  const running = state.running || state.resimulating;

  return (
    <div className={cn('relative flex min-h-0 flex-col', className)}>
      <div className="relative min-h-0 flex-1 overflow-hidden rounded border border-line-soft bg-bg/40">
        <canvas
          ref={ref}
          className="grid-field h-full w-full"
          style={{ minHeight: 420 }}
          role="img"
          aria-label={`Simulation world: ${agents.length} synthetic agents in ${segments.length} segments.`}
        />

        {/* zoom readout + view toggle */}
        <div className="pointer-events-none absolute inset-x-0 top-0 flex items-start justify-between gap-3 p-3">
          <div className="pointer-events-auto flex items-center gap-2 rounded border border-line bg-surface/90 px-2.5 py-1 backdrop-blur-sm">
            <span className="font-mono text-[10px] tracking-[0.09em] uppercase text-subtle">Zoom</span>
            <span className="flex h-1.5 w-20 items-center rounded-full bg-line">
              <span className="h-1.5 w-full rounded-full bg-accent/70" />
            </span>
            <span className="tabular text-[11px] text-muted">100%</span>
          </div>

          <div className="pointer-events-auto flex rounded border border-line bg-surface/90 p-0.5 backdrop-blur-sm">
            {(['agents', 'clusters', 'heatmap'] as const).map((m) => (
              <button
                key={m}
                type="button"
                onClick={() => setMode(m)}
                aria-pressed={mode === m}
                className={cn(
                  'focus-ring rounded-sm px-2.5 py-1 text-[11.5px] capitalize transition-colors',
                  mode === m ? 'bg-accent/15 text-accent' : 'text-subtle hover:text-fg',
                )}
              >
                {m}
              </button>
            ))}
          </div>
        </div>

        {/* the content, at the centre of its own audience */}
        <div className="pointer-events-none absolute inset-0 flex items-center justify-center">
          <div className="pointer-events-auto w-[min(340px,72%)] rounded-lg border border-line-strong bg-surface/95 p-3.5 shadow-[0_0_40px_-12px_oklch(0.68_0.16_295_/_0.35)] backdrop-blur-sm">
            <div className="flex items-center gap-2">
              <span className="grid size-6 place-items-center rounded-sm bg-surface2 font-mono text-[10px] text-muted">
                {(asset?.title?.trim()?.[0] ?? 'C').toUpperCase()}
              </span>
              <span className="min-w-0 flex-1 truncate text-[13px] font-medium text-fg">
                {asset?.title?.trim() || 'Your content'}
              </span>
              <Tag tone="accent">{asset ? CONTENT_KIND_LABELS[asset.kind] : 'content'}</Tag>
            </div>

            <p className="mt-2.5 line-clamp-3 text-[13.5px] leading-relaxed text-fg/90">
              {asset?.body?.trim() || 'Analysing…'}
            </p>

            <div className="mt-3 flex items-center gap-3 border-t border-line-soft pt-2.5">
              <MetricChip value={attention} code="att" tone="var(--color-amplify)" />
              <MetricChip value={trust} code="tru" tone="var(--color-positive)" />
              <MetricChip value={share} code="sh" tone="var(--color-caution)" />
              <span className="ml-auto font-mono text-[10px] tracking-[0.08em] uppercase text-subtle">
                simulated
              </span>
            </div>
          </div>
        </div>

        {/* in-flight status */}
        {running ? (
          <div className="pointer-events-none absolute inset-x-0 top-16 flex justify-center">
            <StatusPill
              title={state.pass === 'B' ? 'Re-simulating' : 'Simulating'}
              detail={
                state.ofRounds > 0
                  ? `Round ${state.round} of ${state.ofRounds} across ${agents.length} agents…`
                  : `Reading across ${agents.length} agents…`
              }
            />
          </div>
        ) : null}

        {/* the finding */}
        {!running && finding ? (
          <div className="pointer-events-none absolute inset-x-0 bottom-4 flex justify-center px-4">
            <WorldCallout
              tone={rejected > 0 ? 'var(--color-negative)' : 'var(--color-caution)'}
              action="inspect"
              onAction={onInspect}
            >
              <span className="font-medium">{finding.label}</span>
              {/* Only claim rejections when there are some. */}
              {rejected > 0 ? ` · ${rejected} agents rejected it outright.` : null}
            </WorldCallout>
          </div>
        ) : null}
      </div>

      {/* three stacked bars, the reading of the room at a glance */}
      <div className="mt-3 grid gap-x-8 gap-y-3 sm:grid-cols-3">
        <MetricBar label="Attention" value={attention} tone="var(--color-amplify)" />
        <MetricBar label="Trust" value={trust} tone="var(--color-positive)" />
        <MetricBar label="Share intent" value={share} tone="var(--color-caution)" />
      </div>
      <div className="mt-2 flex items-center gap-3">
        <SegmentedBar
          value={metrics ? (rejected / Math.max(1, agents.length)) * 100 : 0}
          tone="var(--color-negative)"
          blocks={60}
          className="max-w-[220px] flex-1"
        />
        <span className="text-[12.5px] text-subtle">
          {rejected} of {agents.length} agents rejected the content outright
        </span>
      </div>
    </div>
  );
}
