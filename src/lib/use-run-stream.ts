'use client';

import { useCallback, useMemo, useRef, useState } from 'react';
import type {
  Audience,
  ContentAsset,
  ContentDNA,
  CreateRunRequest,
  MetricsBundle,
  RunEvent,
} from '../core/domain';
import { RunEventLog, type EventEnvelope } from './event-log';
import { initialRunState, runReducer, type RunViewState } from './run-reducer';
import { readRunStream } from './sse';

/**
 * What the client sends back with a re-simulation request.
 *
 * Serverless instances do not share memory, so the record written by run A may
 * not be present when the re-simulation runs. Every field here was produced by
 * the server and delivered over the event stream, so the client is only echoing
 * it back — and the server re-derives the population hash and asserts it, so the
 * controlled-comparison guarantee does not depend on trusting this payload.
 */
export type ResimulateContext = {
  audience: Audience;
  dna: ContentDNA;
  versionBAsset: ContentAsset;
  metricsA: MetricsBundle;
  rounds: number;
};

/**
 * The single subscription point for a run.
 *
 * Every event arriving from the server is appended to the log and folded into
 * the view state by the pure reducer. Components never call `setState` for run
 * data; they read projections of this state or subscribe to the log directly.
 *
 * Arrival is BATCHED into animation frames. A 24-agent x 3-round run emits
 * several hundred events, and re-rendering once per event would drop frames and
 * make the room stutter; flushing per frame keeps updates at display rate.
 */

export type LogEntry = EventEnvelope;

export type UseRunStream = {
  state: RunViewState;
  entries: LogEntry[];
  log: RunEventLog;
  error: string | null;
  start: (request: CreateRunRequest) => Promise<void>;
  resimulate: (runId: string, context: ResimulateContext) => Promise<void>;
  cancel: () => void;
  reset: () => void;
};

export function useRunStream(): UseRunStream {
  const logRef = useRef<RunEventLog | null>(null);
  if (logRef.current === null) logRef.current = new RunEventLog();
  const log = logRef.current;

  const [state, setState] = useState<RunViewState>(initialRunState);
  const [entries, setEntries] = useState<LogEntry[]>([]);
  const [error, setError] = useState<string | null>(null);

  const abortRef = useRef<AbortController | null>(null);
  const bufferRef = useRef<EventEnvelope[]>([]);
  const frameRef = useRef<number | null>(null);

  const flush = useCallback(() => {
    frameRef.current = null;
    const buffered = bufferRef.current;
    if (buffered.length === 0) return;
    bufferRef.current = [];

    setState((prev) => buffered.reduce(runReducer, prev));
    setEntries([...log.all()]);
  }, [log]);

  const push = useCallback(
    (event: RunEvent) => {
      bufferRef.current.push(log.append(event));
      if (frameRef.current === null) {
        frameRef.current = requestAnimationFrame(flush);
      }
    },
    [flush, log],
  );

  const consume = useCallback(
    async (response: Response, signal: AbortSignal) => {
      for await (const event of readRunStream(response, signal)) {
        if (signal.aborted) break;
        push(event);
      }
    },
    [push],
  );

  const start = useCallback(
    async (request: CreateRunRequest) => {
      log.reset();
      bufferRef.current = [];
      setEntries([]);
      setState(initialRunState);
      setError(null);

      const controller = new AbortController();
      abortRef.current = controller;
      // Show the run as started immediately so the UI responds to the click,
      // rather than waiting for the first network round-trip.
      setState((prev) => ({ ...prev, running: true, stage: 'ingest', stageLabel: 'Reading the content' }));

      try {
        const response = await fetch('/api/runs', {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify(request),
          signal: controller.signal,
        });

        if (!response.ok) {
          const detail = (await response.json().catch(() => null)) as { message?: string } | null;
          setError(detail?.message ?? 'That request could not be read.');
          setState((prev) => ({ ...prev, running: false }));
          return;
        }

        await consume(response, controller.signal);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError('The run could not be completed. You can try again.');
          setState((prev) => ({ ...prev, running: false }));
        }
      } finally {
        if (frameRef.current !== null) {
          cancelAnimationFrame(frameRef.current);
          frameRef.current = null;
        }
        flush();
        setState((prev) => ({ ...prev, running: false }));
      }
    },
    [consume, flush, log],
  );

  const resimulate = useCallback(
    async (runId: string, context: ResimulateContext) => {
      const controller = new AbortController();
      abortRef.current = controller;
      setError(null);
      setState((prev) => ({ ...prev, resimulating: true, pass: 'B' }));

      try {
        const response = await fetch(`/api/runs/${encodeURIComponent(runId)}/resimulate`, {
          method: 'POST',
          headers: { 'content-type': 'application/json' },
          body: JSON.stringify({ runId, context }),
          signal: controller.signal,
        });

        if (!response.ok) {
          setError('The re-simulation could not be started.');
          setState((prev) => ({ ...prev, resimulating: false }));
          return;
        }

        await consume(response, controller.signal);
      } catch (err) {
        if ((err as Error).name !== 'AbortError') {
          setError('The re-simulation could not be completed.');
          setState((prev) => ({ ...prev, resimulating: false }));
        }
      } finally {
        flush();
        setState((prev) => ({ ...prev, resimulating: false }));
      }
    },
    [consume, flush],
  );

  const cancel = useCallback(() => {
    abortRef.current?.abort();
    abortRef.current = null;
  }, []);

  const reset = useCallback(() => {
    abortRef.current?.abort();
    log.reset();
    bufferRef.current = [];
    setEntries([]);
    setState(initialRunState);
    setError(null);
  }, [log]);

  return useMemo(
    () => ({ state, entries, log, error, start, resimulate, cancel, reset }),
    [state, entries, log, error, start, resimulate, cancel, reset],
  );
}
