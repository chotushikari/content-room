'use client';

import { useState } from 'react';
import type { ContentKind, CreateRunRequest } from '../core/domain';
import { CONTENT_KIND_LABELS } from '../core/domain';
import { cn } from '../lib/cn';
import { Panel } from './ui';

/**
 * The input screen.
 *
 * One box, one button. Options sit behind a disclosure, because a first-time
 * user has exactly one decision to make — what to rehearse — and the previous
 * version put fifteen content-kind buttons and two sliders in the way before
 * they had typed anything.
 *
 * The field accepts either a link or the content itself; the distinction is
 * detected rather than asked about, because someone with a post in their
 * clipboard should not have to classify it first.
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
  const [showOptions, setShowOptions] = useState(false);

  const trimmed = input.trim();
  const looksLikeUrl = /^https?:\/\/\S+$/i.test(trimmed);
  const busy = running || resimulating;

  function submit(): void {
    if (busy) return;
    const options = { audienceSize, rounds, engineId: 'deterministic' as const, demoMode: false };

    if (!trimmed) {
      // Empty input is not an error: it loads the worked example.
      onStart({ source: { type: 'fixture', fixtureId: 'velloe' }, options });
      return;
    }
    if (looksLikeUrl) {
      onStart({ source: { type: 'url', url: trimmed }, options });
      return;
    }
    onStart({ source: { type: 'manual', kind, title: '', body: trimmed }, options });
  }

  return (
    <Panel className="overflow-hidden">
      <div className="px-5 pb-5 pt-6 sm:px-7 sm:pb-6 sm:pt-8">
        <h1 className="text-2xl font-medium tracking-tight sm:text-3xl">How will this land?</h1>
        <p className="mt-3 max-w-xl text-sm leading-relaxed text-muted">
          Paste a post, an ad, an email, a script, or a link. We put it in front of a simulated
          audience and tell you whether it works, why, and what to change.
        </p>

        <label htmlFor="cr-input" className="sr-only">
          Your content, or a link to it
        </label>
        <textarea
          id="cr-input"
          value={input}
          onChange={(e) => setInput(e.target.value)}
          rows={7}
          spellCheck={false}
          placeholder="Paste your content here, or a link to it…"
          className="focus-ring mt-4 w-full resize-y rounded border border-line bg-bg/60 px-3.5 py-3 text-sm leading-relaxed text-fg placeholder:text-subtle"
        />

        <div className="mt-4 flex flex-wrap items-center gap-3">
          <button
            type="button"
            onClick={submit}
            disabled={busy}
            className={cn(
              'focus-ring rounded border px-5 py-2.5 text-sm font-medium transition-colors',
              busy
                ? 'cursor-not-allowed border-line text-subtle'
                : 'border-accent/60 bg-accent/15 text-fg hover:bg-accent/25',
            )}
          >
            {busy ? 'Reviewing…' : 'Review it'}
          </button>

          <button
            type="button"
            onClick={() => setShowOptions((v) => !v)}
            aria-expanded={showOptions}
            className="focus-ring rounded border border-line px-3 py-2.5 text-xs text-muted transition-colors hover:text-fg"
          >
            {showOptions ? 'Hide options' : 'Options'}
          </button>

          <span className="note">
            {looksLikeUrl
              ? 'Link detected. Many platforms only expose a headline — paste the text for a sharper read.'
              : trimmed
                ? 'Ready.'
                : 'Leave empty to try it on a worked example.'}
          </span>
        </div>

        {showOptions ? (
          <div className="mt-5 grid gap-5 rounded border border-line-soft bg-bg/40 px-4 py-4 sm:grid-cols-3">
            <label className="block">
              <span className="micro">Content type</span>
              <select
                value={kind}
                onChange={(e) => setKind(e.target.value as ContentKind)}
                disabled={looksLikeUrl || !trimmed}
                className="focus-ring mt-2 w-full rounded border border-line bg-bg px-2 py-1.5 text-xs text-fg disabled:opacity-40"
              >
                {KINDS.map((k) => (
                  <option key={k} value={k}>
                    {CONTENT_KIND_LABELS[k]}
                  </option>
                ))}
              </select>
            </label>

            <label className="block">
              <span className="micro">Audience size — {audienceSize}</span>
              <input
                type="range"
                min={8}
                max={60}
                step={2}
                value={audienceSize}
                onChange={(e) => setAudienceSize(Number(e.target.value))}
                className="focus-ring mt-3 w-full accent-[oklch(0.72_0.15_250)]"
              />
              <span className="note">More agents means steadier numbers.</span>
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
                className="focus-ring mt-3 w-full accent-[oklch(0.72_0.15_250)]"
              />
              <span className="note">How many passes the audience makes.</span>
            </label>
          </div>
        ) : null}

        <p className="mt-4 note">
          Works with no setup. The audience is synthetic, every number is a simulated estimate, and
          none of it is a forecast of real-world performance.
        </p>
      </div>
    </Panel>
  );
}
