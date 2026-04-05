import { NextResponse, type NextRequest } from 'next/server'

// Expose the request pathname to server components and route handlers
// via an internal `x-pathname` header. next-intl's request config uses
// this to detect customer-facing routes and apply forced locales.
export function proxy(request: NextRequest) {
  const requestHeaders = new Headers(request.headers)
  requestHeaders.set('x-pathname', request.nextUrl.pathname)
  return NextResponse.next({
    request: { headers: requestHeaders },
  })
}

export const config = {
  matcher: [
    // Everything except static files, images, and Next internals
    '/((?!_next/static|_next/image|favicon\\.ico|.*\\.(?:svg|png|jpg|jpeg|gif|webp|ico|css|js|woff|woff2|ttf|eot)$).*)',
  ],
}
