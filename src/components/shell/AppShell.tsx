'use client';

import Link from 'next/link';
import type { ReactNode } from 'react';
import { cn } from '../../lib/cn';

/**
 * The application shell.
 *
 * Previously the interface was a floating column of cards with no persistent
 * identity and no status. This gives every state — landing and tool alike — the
 * same frame: a mark, a wordmark, the run's mode, and the view switcher. That is
 * what makes it feel like one place rather than a form that becomes a report.
 *
 * It carries no run logic. The mode badge and tabs are passed in, so the shell
 * stays a layout primitive.
 */

export function Mark({ className }: { className?: string }) {
  // A small glyph rather than an image: no request, scales cleanly, and it
  // inherits colour so the mark tints with the accent.
  return (
    <svg viewBox="0 0 20 20" aria-hidden className={cn('size-5', className)} fill="none">
      <circle cx="10" cy="10" r="8.25" stroke="currentColor" strokeWidth="1.1" opacity="0.45" />
      <circle cx="10" cy="10" r="3.1" fill="currentColor" />
      <circle cx="10" cy="2.4" r="1.5" fill="currentColor" opacity="0.85" />
      <circle cx="16.3" cy="13.6" r="1.5" fill="currentColor" opacity="0.85" />
      <circle cx="3.7" cy="13.6" r="1.5" fill="currentColor" opacity="0.85" />
    </svg>
  );
}

export function Wordmark({ href = '/' }: { href?: string }) {
  return (
    <Link href={href} className="focus-ring flex items-center gap-2 rounded-sm">
      <Mark className="text-accent" />
      <span className="display text-[15px] tracking-tight text-fg">Content Room</span>
    </Link>
  );
}

export function AppShell({
  status,
  tabs,
  children,
}: {
  /** The mode badge, or a CTA on the landing page. */
  status?: ReactNode;
  /** The view switcher, rendered only once a run exists. */
  tabs?: ReactNode;
  children: ReactNode;
}) {
  return (
    <div className="flex min-h-screen flex-col">
      <header className="sticky top-0 z-20 border-b border-line-soft bg-bg/85 backdrop-blur-sm">
        <div className="mx-auto flex h-14 w-full max-w-[1440px] items-center gap-3 px-5 sm:px-8">
          <Wordmark />
          <div className="ml-auto flex items-center gap-2">
            {tabs}
            {status}
          </div>
        </div>
      </header>
      <div className="flex-1">{children}</div>
    </div>
  );
}
