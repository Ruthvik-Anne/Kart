// Same-origin bridge for the local FastAPI service. Only KART API paths are forwarded.
type Context = { params: Promise<{ path: string[] }> };

async function forward(request: Request, { params }: Context): Promise<Response> {
  const { path } = await params;
  if (!path.length || !['v1', 'dev', 'health'].includes(path[0]) ||
      path.some(part => !/^[a-zA-Z0-9_-]+$/.test(part))) {
    return Response.json({ detail: 'Invalid API path' }, { status: 400 });
  }
  const base = process.env.KART_BACKEND_URL ?? 'http://127.0.0.1:8000';
  const target = new URL(path.map(encodeURIComponent).join('/') + new URL(request.url).search, base.endsWith('/') ? base : base + '/');
  const body = request.method === 'POST' ? await request.text() : undefined;
  if (body && body.length > 1_000_000) return Response.json({ detail: 'Request too large' }, { status: 413 });
  try {
    const response = await fetch(target, {
      method: request.method, body, cache: 'no-store',
      headers: {
        ...(request.headers.get('authorization') ? { authorization: request.headers.get('authorization')! } : {}),
        ...(body ? { 'content-type': 'application/json' } : {}),
      },
    });
    return new Response(await response.text(), {
      status: response.status,
      headers: { 'content-type': response.headers.get('content-type') ?? 'application/json', 'cache-control': 'no-store' },
    });
  } catch {
    return Response.json({ detail: 'KART backend is unavailable' }, { status: 502 });
  }
}

export const GET = forward;
export const POST = forward;
