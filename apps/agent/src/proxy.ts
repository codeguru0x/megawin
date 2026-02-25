/**
 * Next.js 16 Proxy – Agent portal.
 *
 * Chỉ cho phép accountType === "agent" truy cập.
 * Redirect company/staff accounts sang /unauthorized.
 *
 * @see https://better-auth.com/docs/integrations/next#nextjs-16-proxy
 */

import { type NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_ROUTES = ["/login", "/api/auth"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function getAccountTypeFromCookie(
  request: NextRequest,
): string | undefined {
  const raw =
    request.cookies.get("better-auth.session_data")?.value;

  if (!raw) return undefined;

  try {
    const json = JSON.parse(raw);
    return json?.user?.accountType as string | undefined;
  } catch {
    // skip
  }

  try {
    const decoded = atob(raw);
    const json = JSON.parse(decoded);
    return json?.user?.accountType as string | undefined;
  } catch {
    return undefined;
  }
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  const accountType = getAccountTypeFromCookie(request);

  if (accountType && accountType !== "agent") {
    return NextResponse.redirect(new URL("/unauthorized", request.url));
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
