/**
 * Next.js 16 Proxy – bảo vệ tất cả routes.
 *
 * Kiểm tra session cookie tồn tại → redirect sang /login nếu chưa đăng nhập.
 * Đây là optimistic check (chỉ check cookie tồn tại, không validate).
 * Validation thực sự được thực hiện ở server component / API route level.
 *
 * @see https://better-auth.com/docs/integrations/next#nextjs-16-proxy
 */

import { type NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

/** Routes không cần xác thực. */
const PUBLIC_ROUTES = ["/login", "/api/auth"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  // Cho phép static files và public routes
  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  // Kiểm tra session cookie
  const sessionCookie = getSessionCookie(request);

  if (!sessionCookie) {
    // Lưu URL hiện tại để redirect lại sau khi đăng nhập
    const loginUrl = new URL("/login", request.url);
    loginUrl.searchParams.set("callbackUrl", pathname);
    return NextResponse.redirect(loginUrl);
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    /*
     * Match tất cả paths ngoại trừ:
     * - _next/static (static files)
     * - _next/image (image optimization)
     * - favicon.ico, robots.txt, sitemap.xml (public meta files)
     */
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
