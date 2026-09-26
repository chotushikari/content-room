import { getRunStore } from '@/server/store';

export const runtime = 'nodejs';
export const dynamic = 'force-dynamic';

export async function GET(
  _request: Request,
  { params }: { params: Promise<{ id: string }> },
): Promise<Response> {
  const { id } = await params;

  try {
    const store = getRunStore();
    const record = await store.get(id);
    if (!record) {
      return Response.json({ error: 'NOT_FOUND' }, { status: 404 });
    }
    return Response.json(record);
  } catch {
    // A corrupt or hand-edited stored record must never be returned as if it
    // were valid domain data.
    return Response.json({ error: 'INTERNAL' }, { status: 500 });
  }
}
