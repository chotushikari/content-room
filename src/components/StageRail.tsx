'use client';

import { cn } from '../lib/cn';
import type { RunViewState } from '../lib/run-reducer';
import { unlockedStations, type Station } from '../lib/run-reducer';

/**
 * The journey rail: CONTENT → AUDIENCE → ROOM → INTELLIGENCE → STRATEGY →
 * COMPARISON.
 *
 * A station is unlocked by the ARRIVAL OF ITS EVENT, not by a step counter. The
 * rail is therefore a projection of the event log, which is what makes the
 * sequence honest: a station cannot appear before the event that produced its
 * data has actually arrived.
 */

const STATIONS: Array<{ id: Station; label: string; unlockEvent: string }> = [
  { id: 'content', label: 'Content', unlockEvent: 'ingest_resolved' },
  { id: 'audience', label: 'Audience', unlockEvent: 'audience_ready' },
  { id: 'room', label: 'Room', unlockEvent: 'round_started' },
  { id: 'intelligence', label: 'Intelligence', unlockEvent: 'metrics_ready' },
  { id: 'strategy', label: 'Strategy', unlockEvent: 'brief_ready' },
  { id: 'comparison', label: 'Comparison', unlockEvent: 'comparison_ready' },
];

export function StageRail({ state }: { state: RunViewState }) {
  const unlocked = unlockedStations(state);
  const activeIndex = unlocked.length === 0 ? -1 : unlocked.length - 1;

  return (
    <nav
      aria-label="Run stations"
      // `min-w-0` is required, not cosmetic: a flex item defaults to
      // `min-width: auto` and refuses to shrink below its content, so without it
      // the rail pushed the whole page 548px wide on a 390px viewport instead of
      // scrolling within itself.
      className="scroll-thin flex min-w-0 flex-1 items-center gap-1 overflow-x-auto"
    >
      {STATIONS.map((station, i) => {
        const isUnlocked = unlocked.includes(station.id);
        const isActive = i === activeIndex;
        return (
          <div key={station.id} className="flex shrink-0 items-center">
            {i > 0 ? (
              <span
                className={cn('mx-1 h-px w-4', isUnlocked ? 'bg-accent/50' : 'bg-line')}
                aria-hidden
              />
            ) : null}
            <div
              className={cn(
                'flex items-center gap-1.5 rounded border px-2 py-1 transition-colors',
                isActive
                  ? 'border-accent/60 bg-accent/10 text-fg'
                  : isUnlocked
                    ? 'border-line text-muted'
                    : 'border-line-soft text-subtle',
              )}
              title={isUnlocked ? `unlocked by ${station.unlockEvent}` : `waiting for ${station.unlockEvent}`}
            >
              <span
                className={cn(
                  'size-1.5 rounded-full',
                  isActive ? 'bg-accent' : isUnlocked ? 'bg-muted' : 'bg-line',
                )}
                aria-hidden
              />
              <span className="font-mono text-3xs uppercase tracking-wider whitespace-nowrap">
                {station.label}
              </span>
            </div>
          </div>
        );
      })}
    </nav>
  );
}
