import type { RunEvent } from '../core/domain';

/**
 * Server-sent events transport for a run.
 *
 * Why streaming rather than polling: on Vercel Hobby there is nowhere durable
 * for a detached job to live. Cron has a one-per-day minimum interval, and
 * `waitUntil` promises are cancelled when the function hits its deadline. So the
 * simulation runs INSIDE the request the browser is already consuming.
 *
 * Heartbeats are mandatory, not decorative: Vercel sends HTTP/2 PING frames, but
 * an idle HTTP/1.1 connection can be closed by an intermediary.
 */

const HEARTBEAT_MS = 5000;

function encode(event: RunEvent): string {
  return `data: ${JSON.stringify(event)}\n\n`;
}

export function sseResponse(
  generator: AsyncGenerator<RunEvent>,
  signal: AbortSignal,
  options: { onDone?: (events: RunEvent[]) => void } = {},
): Response {
  const encoder = new TextEncoder();
  const collected: RunEvent[] = [];

  const stream = new ReadableStream<Uint8Array>({
    async start(controller) {
      let closed = false;
      const safeEnqueue = (chunk: string) => {
        if (closed) return;
        try {
          controller.enqueue(encoder.encode(chunk));
        } catch {
          closed = true;
        }
      };

      const heartbeat = setInterval(() => {
        safeEnqueue(encode({ type: 'heartbeat', at: new Date().toISOString() }));
      }, HEARTBEAT_MS);

      const onAbort = () => {
        // Propagating this is what stops a disconnected browser leaving a
        // 60-second model fan-out running.
        void generator.return?.(undefined);
      };
      signal.addEventListener('abort', onAbort, { once: true });

      try {
        for await (const event of generator) {
          if (signal.aborted) break;
          collected.push(event);
          safeEnqueue(encode(event));
        }
      } catch {
        safeEnqueue(
          encode({
            type: 'run_failed',
            stage: 'stream',
            code: 'INTERNAL',
            message: 'The run could not be completed.',
            recovered: false,
          }),
        );
      } finally {
        clearInterval(heartbeat);
        signal.removeEventListener('abort', onAbort);
        options.onDone?.(collected);
        if (!closed) {
          closed = true;
          try {
            controller.close();
          } catch {
            // Already closed by the client disconnecting.
          }
        }
      }
    },
    cancel() {
      void generator.return?.(undefined);
    },
  });

  return new Response(stream, {
    headers: {
      'content-type': 'text/event-stream; charset=utf-8',
      'cache-control': 'no-cache, no-transform',
      connection: 'keep-alive',
      'x-accel-buffering': 'no',
    },
  });
}

/** Client-side reader. Throws on a malformed frame rather than skipping it. */
export async function* readRunStream(
  response: Response,
  signal?: AbortSignal,
): AsyncGenerator<RunEvent> {
  if (!response.body) throw new Error('No response body');
  const reader = response.body.getReader();
  const decoder = new TextDecoder();
  let buffer = '';

  try {
    for (;;) {
      if (signal?.aborted) return;
      const { done, value } = await reader.read();
      if (done) break;
      buffer += decoder.decode(value, { stream: true });

      let boundary = buffer.indexOf('\n\n');
      while (boundary !== -1) {
        const frame = buffer.slice(0, boundary);
        buffer = buffer.slice(boundary + 2);
        boundary = buffer.indexOf('\n\n');

        const line = frame.split('\n').find((l) => l.startsWith('data: '));
        if (!line) continue;
        const json = line.slice(6);
        try {
          yield JSON.parse(json) as RunEvent;
        } catch {
          // A malformed frame is skipped rather than killing the stream, so a
          // single bad event cannot blank the page mid-demo.
        }
      }
    }
  } finally {
    reader.releaseLock?.();
  }
}
