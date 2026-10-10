import { NextResponse, type NextRequest } from 'next/server';

// The browser-local prototype is never served by the campus deployment.
export function proxy(request: NextRequest) {
  if (process.env.KART_APP_MODE === 'campus') {
    return NextResponse.redirect(new URL('/live', request.url));
  }
  return NextResponse.next();
}

export const config = {
  matcher: '/((?!api|_next|live|icon.svg|favicon.ico).*)',
};
