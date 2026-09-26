import { CreateRunRequestSchema } from '@/core/domain';
import { runPipeline } from '@/server/pipeline';
import { sseResponse } from '@/lib/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

export async function POST(request: Request): Promise<Response> {
  let body: unknown;
  try {
    body = await request.json();
  } catch {
    return Response.json(
      { error: 'INVALID_INPUT', message: 'That request could not be read.' },
      { status: 400 },
    );
  }

  const parsed = CreateRunRequestSchema.safeParse(body);
  if (!parsed.success) {
    return Response.json(
      { error: 'INVALID_INPUT', message: 'That request could not be read.' },
      { status: 400 },
    );
  }

  const generator = runPipeline({
    source: parsed.data.source,
    options: parsed.data.options,
    signal: request.signal,
  });

  return sseResponse(generator, request.signal);
}
