import { NextResponse, type NextRequest } from 'next/server';
import { SESSION_COOKIE, sessionUser } from '@/server/auth';
import { homeFor, type User } from '@/rbac/policy';

/** Every app route that requires a server-side session; children match by prefix. */
const PROTECTED_PREFIXES = [
  '/dashboard', '/food', '/xerox', '/shop', '/services', '/tasks', '/my-tasks',
  '/marketplace', '/events', '/orders', '/messages', '/wallet', '/notifications',
  '/provider', '/vendor', '/admin',
];

function isProtected(pathname: string): boolean {
  return PROTECTED_PREFIXES.some(p => pathname === p || pathname.startsWith(`${p}/`));
}

/** Only allow same-site relative redirects so `?next=` can never become an open redirect. */
function safeNext(raw: string | null): string | null {
  if (!raw) return null;
  if (!raw.startsWith('/') || raw.startsWith('//') || raw.startsWith('/\\')) return null;
  return isProtected(raw) ? raw : null;
}

/**
 * Network-boundary guard (Next 16 `proxy`, Node runtime): every request is checked
 * against the Postgres session store before a protected route is rendered.
 * Route handlers re-check anyway; this keeps navigation honest.
 */
export async function proxy(request: NextRequest) {
  const { pathname, search } = request.nextUrl;
  const token = request.cookies.get(SESSION_COOKIE)?.value;
  const user: User | null = token ? await sessionUser(token) : null;

  if (isProtected(pathname)) {
    if (!user) {
      const next = safeNext(pathname + search);
      const url = new URL('/login', request.url);
      if (next) url.searchParams.set('next', next);
      return NextResponse.redirect(url);
    }
    return NextResponse.next();
  }

  if (pathname === '/') {
    return NextResponse.redirect(new URL(user ? homeFor(user) : '/login', request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    '/((?!api|_next/static|_next/image|favicon\\.ico|icon\\.svg|.*\\.(?:png|jpg|jpeg|gif|webp|woff2?|ttf|txt|json)$).*)',
  ],
};
