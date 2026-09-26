'use client';

import { useState } from 'react';
import type { ContentKind, CreateRunRequest } from '../core/domain';
import { CONTENT_KIND_LABELS } from '../core/domain';
import { cn } from '../lib/cn';
import { Panel } from './ui';

/**
 * Station 0 — the interface to the room.
 *
 * One field accepts either a URL or pasted content. The distinction is detected
 * rather than asked for, because a user with a post in their clipboard should not
 * have to classify it first.
 */

const KINDS = Object.keys(CONTENT_KIND_LABELS) as ContentKind[];

export function StartPanel({
  onStart,
  running,
  resimulating,
}: {
  onStart: (request: CreateRunRequest) => void;
  running: boolean;
  resimulating: boolean;
}) {
  const [input, setInput] = useState('');
  const [kind, setKind] = useState<ContentKind>('social_post');
  const [audienceSize, setAudienceSize] = useState(24);
  const [rounds, setRounds] = useState(3);
  const [demoMode, setDemoMode] = useState(false);

  const trimmed = input.trim();
  const looksLikeUrl = /^https?:\/\/\S+$/i.test(trimmed);
  const busy = running || resimulating;

  function submit() {
    if (busy) return;
    if (!trimmed) {
      onStart({ source: { type: 'fixture', fixtureId: 'velloe' }, options: { audienceSize, rounds, engineId: 'deterministic', demoMode } });
      return;
    }
    if (looksLikeUrl) {
      onStart({ source: { type: 'url', url: trimmed }, options: { audienceSize, rounds, engineId: 'deterministic', demoMode } });
      return;
    }
    onStart({
      source: { type: 'manual', kind, title: '', body: trimmed },
      options: { audienceSize, rounds, engineId: 'deterministic', demoMode },
    });
  }

  return (
    <Panel className="overflow-hidden">
      <div className="border-b border-line-soft px-5 pb-5 pt-6 sm:px-7 sm:pb-6 sm:pt-8">
        <p className="micro">Content Room</p>
        <h1 className="mt-2 text-2xl font-medium tracking-tight sm:text-3xl">
          Rehearse before you publish.
        </h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Put any piece of content in front of a simulated audience and see what happens, why it
          happens, and what to change — before anyone outside the team sees it.
        </p>
      </div>

      <div className="px-5 py-5 sm:px-7">
        <label htmlFor="cr-input" className="micro">
          Paste a URL or your content
        </label>
        <textarea
          id="cr-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={5}
          spellCheck={false}
          placeholder="https://… or paste the caption, script, email or ad copy"
          className="focus-ring mt-2 w-full resize-y rounded border border-line bg-bg/60 px-3 py-2.5 text-sm leading-relaxed text-fg placeholder:text-subtle"
        />

        <p className="mt-2 note">
          {looksLikeUrl
            ? 'Link detected — we will read what the page publicly exposes. Many platforms allow metadata only; you can paste the text instead for a sharper rehearsal.'
            : trimmed
              ? 'Content detected — this will be analysed directly.'
              : 'Leave empty to load the demo scenario.'}
        </p>

        {/* Content kind, only meaningful for pasted content. */}
        <div
          className={cn(
            'mt-4 transition-opacity',
            looksLikeUrl || !trimmed ? 'pointer-events-none opacity-40' : 'opacity-100',
          )}
        >
          <span className="micro">Content kind</span>
          <div className="mt-2 flex flex-wrap gap-1">
            {KINDS.map((k) => (
              <button
                key={k}
                type="button"
                onClick={() => setKind(k)}
                className={cn(
                  'focus-ring rounded border px-2 py-1 font-mono text-3xs uppercase tracking-wider transition-colors',
                  kind === k
                    ? 'border-accent/60 bg-accent/10 text-accent'
                    : 'border-line text-subtle hover:text-muted',
                )}
              >
                {CONTENT_KIND_LABELS[k]}
              </button>
            ))}
          </div>
        </div>

        {/* Run options. */}
        <div className="mt-5 grid gap-4 sm:grid-cols-2">
          <label className="block">
            <span className="micro">Audience size — {audienceSize} synthetic agents</span>
            <input
              type="range"
              min={8}
              max={60}
              step={2}
              value={audienceSize}
              onChange={(e) => setAudienceSize(Number(e.target.value))}
              className="focus-ring mt-2 w-full accent-[oklch(0.72_0.15_250)]"
            />
          </label>
          <label className="block">
            <span className="micro">Rounds — {rounds}</span>
            <input
              type="range"
              min={1}
              max={6}
              step={1}
              value={rounds}
              onChange={(e) => setRounds(Number(e.target.value))}
              className="focus-ring mt-2 w-full accent-[oklch(0.72_0.15_250)]"
            />
          </label>
        </div>

        <div className="mt-5 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className={cn(
              'focus-ring rounded border px-4 py-2 text-sm font-medium transition-colors',
              busy
                ? 'cursor-not-allowed border-line text-subtle'
                : 'border-accent/60 bg-accent/15 text-fg hover:bg-accent/25',
            )}
          >
            {busy ? 'In the room…' : 'Put it in the Room'}
          </button>

          <button
            type="button"
            onClick={() =>
              onStart({
                source: { type: 'fixture', fixtureId: 'velloe' },
                options: { audienceSize, rounds, engineId: 'deterministic', demoMode },
              })
            }
            disabled={busy}
            className="focus-ring rounded border border-line px-3 py-2 text-xs text-muted transition-colors hover:text-fg"
          >
            Load the demo scenario
          </button>

          <label className="flex cursor-pointer items-center gap-2 text-xs text-muted">
            <input
              type="checkbox"
              checked={demoMode}
              onChange={(e) => setDemoMode(e.target.checked)}
              className="focus-ring accent-[oklch(0.72_0.15_250)]"
            />
            Force deterministic engine
          </label>
        </div>

        <p className="mt-4 note">
          Works with no API keys. Simulation is deterministic by default; a model tier is used when
          one is configured. Every number is a simulated estimate.
        </p>
      </div>
    </Panel>
  );
}
