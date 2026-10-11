import { NextResponse, type NextRequest } from 'next/server';

/**
 * UX-only redirect for signed-out visitors. This is NOT a security boundary — the API authorizes
 * every request. `gp_s` is a non-sensitive "has a session" hint set alongside the real cookies.
 */
export function proxy(request: NextRequest) {
  if (request.cookies.has('gp_s')) return NextResponse.next();
  const url = request.nextUrl.clone();
  url.pathname = '/login';
  url.search = `?next=${encodeURIComponent(request.nextUrl.pathname + request.nextUrl.search)}`;
  return NextResponse.redirect(url);
}

export const config = {
  matcher: [
    '/dashboard/:path*',
    '/path/:path*',
    '/courses/:path*',
    '/labs/:path*',
    '/practice/:path*',
    '/mentor/:path*',
    '/projects/:path*',
    '/assessments/:path*',
    '/career/:path*',
    '/knowledge/:path*',
    '/settings/:path*',
    '/admin/:path*',
    '/onboarding/:path*',
  ],
};
