import { ResimulateRequestSchema } from '@/core/domain';
import { resimulatePipeline } from '@/server/pipeline';
import { sseResponse } from '@/lib/sse';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';
export const maxDuration = 120;

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

  const generator = resimulatePipeline({ runId: id, signal: request.signal });
  return sseResponse(generator, request.signal);
}
