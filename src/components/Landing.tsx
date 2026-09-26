'use client';

import { useState } from 'react';
import { useRouter } from 'next/navigation';
import { CONTENT_KIND_LABELS, type ContentKind } from '../core/domain';
import { AppShell } from './shell/AppShell';
import { HeroCanvas } from './landing/HeroCanvas';

/**
 * The landing page.
 *
 * The previous `/` was the input panel itself — a form wearing a homepage's
 * clothes, which explained nothing and gave a first-time visitor no reason to
 * type anything. This states the product, shows the one thing nothing else has
 * (a room of synthetic people reacting), and only then asks for content.
 *
 * The input hands off to /app through sessionStorage rather than the URL:
 * pasted content is routinely longer than a query string will carry, and the
 * tool is a separate route so this page can stay a page.
 */

const PENDING_KEY = 'content-room:pending';

export function Landing({ demoAvailable = true }: { demoAvailable?: boolean }) {
  const router = useRouter();
  const [input, setInput] = useState('');
  const [kind, setKind] = useState<ContentKind>('social_post');

  const trimmed = input.trim();
  const looksLikeUrl = /^https?:\/\/\S+$/i.test(trimmed);

  function go(payload: { source: { type: 'url'; url: string } | { type: 'manual'; kind: ContentKind; body: string } | { type: 'fixture'; fixtureId: string } }) {
    try {
      window.sessionStorage.setItem(PENDING_KEY, JSON.stringify(payload));
    } catch {
      // sessionStorage can be unavailable; /app then just opens empty.
    }
    router.push('/app');
  }

  function submit() {
    if (!trimmed) {
      go({ source: { type: 'fixture', fixtureId: 'velloe' } });
      return;
    }
    if (looksLikeUrl) {
      go({ source: { type: 'url', url: trimmed } });
      return;
    }
    go({ source: { type: 'manual', kind, body: trimmed } });
  }

  return (
    <AppShell
      status={
        <a
          href="#start"
          className="focus-ring rounded-sm border border-accent/50 bg-accent/10 px-3 py-1.5 text-[13px] font-medium text-fg transition-colors hover:bg-accent/20"
        >
          Rehearse a post
        </a>
      }
    >
      <main className="mx-auto w-full max-w-[1440px] px-5 sm:px-8">
        {/* ------------------------------------------------------------ hero */}
        <section className="grid items-center gap-10 pt-14 pb-10 lg:grid-cols-[minmax(0,1fr)_minmax(0,1fr)] lg:gap-14 lg:pt-20">
          <div>
            <p className="label">Synthetic audience rehearsal</p>
            <h1 className="display mt-3 text-[clamp(2.4rem,5.2vw,3.5rem)] text-fg">
              Rehearse before
              <br />
              you publish.
            </h1>
            <p className="mt-5 max-w-[46ch] text-body leading-relaxed text-muted">
              Put a post, an ad, an email or a script in front of a simulated audience and find out
              how it lands — a score, a plain-language read, the changes that would move it, and the
              same audience re-testing the rewrite.
            </p>

            <div className="mt-7 flex flex-wrap items-center gap-x-5 gap-y-2">
              {[
                'Works with no API keys',
                'Deterministic engine',
                'Same-audience re-test',
              ].map((point) => (
                <span key={point} className="flex items-center gap-1.5 text-[13px] text-muted">
                  <span className="size-1.5 rounded-full bg-accent" aria-hidden />
                  {point}
                </span>
              ))}
            </div>
          </div>

          {/* The room, always mid-reaction. Scripted, not a live run — see HeroCanvas. */}
          <div className="relative">
            <HeroCanvas className="grid-field h-[320px] w-full rounded-lg border border-line-soft bg-surface/40 sm:h-[380px]" />
            <p className="note mt-2 text-center">
              A scripted illustration of the journey, not a measured result.
            </p>
          </div>
        </section>

        {/* ----------------------------------------------------------- start */}
        <section id="start" className="scroll-mt-20 pb-12">
          <div className="rounded-lg border border-line bg-surface/60 p-5 sm:p-7">
            <label htmlFor="landing-input" className="label block">
              Paste your content, or a link to it
            </label>
            <textarea
              id="landing-input"
              value={input}
              onChange={(e) => setInput(e.target.value)}
              rows={5}
              spellCheck={false}
              placeholder="The caption, the ad copy, the email, the script — or https://…"
              className="focus-ring mt-3 w-full resize-y rounded border border-line bg-bg/60 px-3.5 py-3 text-body leading-relaxed text-fg placeholder:text-subtle"
            />

            <div className="mt-4 flex flex-wrap items-center gap-3">
              <button
                type="button"
                onClick={submit}
                className="focus-ring rounded border border-accent/60 bg-accent/15 px-5 py-2.5 text-[14px] font-medium text-fg transition-colors hover:bg-accent/25"
              >
                {trimmed ? 'Rehearse it' : 'Open the worked example'}
              </button>

              <label className="flex items-center gap-2 text-[13px] text-muted">
                <span className="label">Content type</span>
                <select
                  value={kind}
                  onChange={(e) => setKind(e.target.value as ContentKind)}
                  disabled={looksLikeUrl}
                  className="focus-ring rounded border border-line bg-bg px-2 py-1.5 text-[13px] text-fg disabled:opacity-40"
                >
                  {(Object.keys(CONTENT_KIND_LABELS) as ContentKind[]).map((k) => (
                    <option key={k} value={k}>
                      {CONTENT_KIND_LABELS[k]}
                    </option>
                  ))}
                </select>
              </label>
            </div>

            <p className="note mt-4">
              Links work for articles, blogs and news pages, and give a title and summary for
              YouTube. Social platforms only serve posts to a logged-in browser, so those open the
              paste path instead — the text is what the analysis needs anyway.
            </p>
          </div>
        </section>

        {/* ----------------------------------------------------------- steps */}
        <section className="border-t border-line-soft py-12">
          <h2 className="text-title text-fg">How it works</h2>
          <ol className="mt-7 grid gap-6 sm:grid-cols-2 lg:grid-cols-4">
            {[
              {
                n: '1',
                t: 'It reads the content',
                d: 'Hook, promise, tone, call to action, and the friction it is likely to create.',
              },
              {
                n: '2',
                t: 'It builds the audience',
                d: 'Segments derived from the content itself, expanded into a seeded population of agents.',
              },
              {
                n: '3',
                t: 'The room reacts',
                d: 'Every agent goes through attention, interpretation and decision, and acts.',
              },
              {
                n: '4',
                t: 'It tells you what to change',
                d: 'A verdict, the changes that would move it, and the same audience testing the rewrite.',
              },
            ].map((step) => (
              <li key={step.n} className="border-t border-line pt-4">
                <span className="tabular text-[13px] text-accent">{step.n}</span>
                <h3 className="mt-2 text-[15px] font-semibold text-fg">{step.t}</h3>
                <p className="mt-1.5 text-[13.5px] leading-relaxed text-muted">{step.d}</p>
              </li>
            ))}
          </ol>
        </section>

        {/* --------------------------------------------------------- honesty */}
        <section className="border-t border-line-soft py-12">
          <div className="grid gap-8 lg:grid-cols-[minmax(0,1fr)_minmax(0,1.4fr)]">
            <div>
              <h2 className="text-title text-fg">What this is, and what it is not</h2>
              <p className="mt-3 text-body leading-relaxed text-muted">
                A rehearsal room. It is genuinely good at telling you which of two versions of your
                own content a given audience prefers. It is not evidence about the real world.
              </p>
            </div>
            <dl className="grid gap-4 sm:grid-cols-2">
              {[
                ['The audience is synthetic', 'Agents are generated from a seeded archetype library, and the same seed always rebuilds the same population.'],
                ['Every number is simulated', 'Metrics carry their sample size and their formula. None of them claims to be measured.'],
                ['No accuracy claim', 'The validation benchmark is being established. Nothing here has been compared against a real outcome.'],
                ['The comparison is controlled', 'Version B is tested against the same population, and the population hash is verified rather than assumed.'],
              ].map(([term, def]) => (
                <div key={term} className="rounded border border-line-soft bg-surface/40 p-4">
                  <dt className="text-[13.5px] font-semibold text-fg">{term}</dt>
                  <dd className="mt-1.5 text-[13px] leading-relaxed text-muted">{def}</dd>
                </div>
              ))}
            </dl>
          </div>
        </section>

        <footer className="border-t border-line-soft py-8">
          <p className="honest">
            Synthetic audience agents, not people. Every number is a simulated estimate and no result
            is representative of any real population. Validation benchmark: being established.
          </p>
        </footer>
      </main>
    </AppShell>
  );
}

/** Exported for /app, which reads what the landing page handed over. */
export const PENDING_CONTENT_KEY = PENDING_KEY;
