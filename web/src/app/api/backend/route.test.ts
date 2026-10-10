import { afterEach, describe, expect, it, vi } from 'vitest';
import { GET, POST } from './[...path]/route';

afterEach(() => vi.unstubAllGlobals());

describe('same-origin identity bridge', () => {
  it('preserves provider redirect and browser-bound state cookie', async () => {
    const fetcher = vi.fn(async () => new Response(null, { status: 307, headers: {
      location: 'https://identity.example.edu/authorize?state=abc',
      'set-cookie': 'kart_oauth_state=abc; Path=/api/backend/auth; HttpOnly; SameSite=Lax',
    } }));
    vi.stubGlobal('fetch', fetcher);
    const result = await GET(new Request('https://kart.example.edu/api/backend/auth/start'),
      { params: Promise.resolve({ path: ['auth', 'start'] }) });
    expect(result.status).toBe(307);
    expect(result.headers.get('location')).toContain('https://identity.example.edu/authorize');
    expect(result.headers.get('set-cookie')).toContain('kart_oauth_state=abc');
    expect(fetcher.mock.calls.length).toBe(1);
  });

  it('forwards session cookie and CSRF token on mutations', async () => {
    let forwarded: RequestInit | undefined;
    const fetcher = vi.fn(async (_url: RequestInfo | URL, init?: RequestInit) => {
      forwarded = init;
      return new Response(JSON.stringify({ ok: true }), { status: 200,
        headers: { 'set-cookie': 'kart_session=; Max-Age=0; Path=/api/backend' } });
    });
    vi.stubGlobal('fetch', fetcher);
    const result = await POST(new Request('https://kart.example.edu/api/backend/auth/logout', {
      method: 'POST', body: '{}', headers: { cookie: 'kart_session=opaque',
        'x-kart-csrf': 'csrf-value', 'content-type': 'application/json' },
    }), { params: Promise.resolve({ path: ['auth', 'logout'] }) });
    expect(result.status).toBe(200);
    expect(forwarded?.headers).toMatchObject({ cookie: 'kart_session=opaque', 'x-kart-csrf': 'csrf-value' });
    expect(result.headers.get('set-cookie')).toContain('kart_session=');
  });
});
