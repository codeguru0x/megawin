/**
 * Next.js 16 Proxy – bảo vệ tất cả routes.
 *
 * 1. Kiểm tra session cookie tồn tại -> redirect sang /login nếu chưa đăng nhập.
 * 2. Kiểm tra scope-level access dựa trên accountType từ session cache cookie:
 *    - Operator routes (accounts, games, default, crm, finance) -> chỉ company accounts
 *    - Tenant routes (/tenant/*) -> chỉ agent accounts
 *
 * Đây là optimistic check (parse cookie, không gọi DB).
 * Validation thực sự nằm ở layout server component (requireOperatorSession / requireTenantSession).
 *
 * @see https://better-auth.com/docs/integrations/next#nextjs-16-proxy
 */

import { type NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_ROUTES = ["/login", "/api/auth"];

/** Routes thuộc scope operator (company / staff). */
const OPERATOR_PREFIXES = [
  "/accounts",
  "/games",
  "/default",
  "/crm",
  "/finance",
];

/** Routes thuộc scope tenant (agent / đại lý). */
const TENANT_PREFIXES = ["/tenant"];

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some(
    (route) => pathname === route || pathname.startsWith(`${route}/`),
  );
}

function matchesScope(pathname: string, prefixes: string[]): boolean {
  return prefixes.some(
    (prefix) => pathname === prefix || pathname.startsWith(`${prefix}/`),
  );
}

/**
 * Parse accountType từ better-auth session cache cookie.
 * Cookie `better-auth.session_data` chứa JSON (có thể base64 encoded).
 * Trả undefined nếu không parse được (fallback cho layout guard).
 */
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
    // Cookie có thể bị corrupted hoặc format khác – skip
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

  if (accountType) {
    const isOperatorRoute = matchesScope(pathname, OPERATOR_PREFIXES);
    const isTenantRoute = matchesScope(pathname, TENANT_PREFIXES);

    if (isOperatorRoute && accountType !== "company") {
      return NextResponse.redirect(new URL("/unauthorized", request.url));
    }

    if (isTenantRoute && accountType !== "agent") {
      return NextResponse.redirect(new URL("/unauthorized", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: [
    "/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)",
  ],
};
