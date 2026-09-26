import { ResimulateRequestSchema } from '@/core/domain';
import { resimulatePipeline } from '@/server/pipeline';
import { sseResponse } from '@/lib/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

/**
 * Re-simulate Version B against the same audience.
 *
 * Accepts an optional context payload because serverless instances do not share
 * memory: the record written by run A may not exist on the instance that serves
 * this request. The client sends back what this server already told it, and the
 * pipeline still re-derives and asserts the population hash, so the controlled-
 * comparison guarantee does not rest on trusting the payload.
 */
export async function POST(
  request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  let body: unknown = {};
  try {
    body = await request.json();
  } catch {
    body = {};
  }

  const parsed = ResimulateRequestSchema.safeParse({ ...(body as object), runId: id });
  if (!parsed.success) {
    return Response.json(
      { error: 'INVALID_INPUT', message: 'That request could not be read.' },
      { status: 400 },
    );
  }

  const generator = resimulatePipeline({
    runId: id,
    context: parsed.data.context,
    signal: request.signal,
  });

  return sseResponse(generator, request.signal);
}
