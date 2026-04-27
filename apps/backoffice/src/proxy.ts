/**
 * Next.js 16 Proxy – Backoffice (company/staff only).
 *
 * Chỉ cho phép accountType === "company" truy cập.
 * Redirect agent accounts sang /unauthorized.
 *
 * @see https://better-auth.com/docs/integrations/next#nextjs-16-proxy
 */

import { type NextRequest, NextResponse } from "next/server";
import { getSessionCookie } from "better-auth/cookies";

const PUBLIC_ROUTES = ["/login", "/api/auth", "/auth/error"];
const SESSION_DATA_COOKIE = "better-auth.session_data";

function isPublicRoute(pathname: string): boolean {
  return PUBLIC_ROUTES.some((route) => pathname === route || pathname.startsWith(`${route}/`));
}

/**
 * Parse cookie `better-auth.session_data` thành JSON.
 *
 * LƯU Ý: cookie này là **cookie cache OPTIONAL** của better-auth. Nó chỉ được
 * populate sau lần đầu gọi `auth.api.getSession()` (xem `cookieCache` option),
 * chứ KHÔNG có ngay sau khi OAuth callback set `session_token`. Vì vậy proxy
 * chỉ được phép dùng cookie này cho mục đích "early-exit" (ví dụ chặn agent
 * account), không được coi sự vắng mặt của nó là "session invalid" — nếu không
 * sẽ gây redirect loop sau khi login từ Cognito (session_token đã có, nhưng
 * session_data chưa kịp tạo).
 */
function parseSessionData(request: NextRequest): Record<string, unknown> | null {
  const raw = request.cookies.get(SESSION_DATA_COOKIE)?.value;

  if (!raw) return null;

  try {
    return JSON.parse(raw) as Record<string, unknown>;
  } catch {
    // skip – thử base64
  }

  try {
    const decoded = atob(raw);
    return JSON.parse(decoded) as Record<string, unknown>;
  } catch {
    return null;
  }
}

function redirectToLogin(request: NextRequest, pathname: string) {
  const loginUrl = new URL("/login", request.url);
  loginUrl.searchParams.set("callbackUrl", pathname);

  const response = NextResponse.redirect(loginUrl);

  // Dọn sạch mọi cookie session còn sót để tránh trạng thái không nhất quán
  // (vd: session_data parse fail, hoặc session_token đã bị invalidate phía server).
  response.cookies.delete("better-auth.session_token");
  response.cookies.delete(SESSION_DATA_COOKIE);

  return response;
}

export function proxy(request: NextRequest) {
  const { pathname } = request.nextUrl;

  if (isPublicRoute(pathname)) {
    return NextResponse.next();
  }

  const sessionCookie = getSessionCookie(request);

  // Chỉ `session_token` là cookie bắt buộc — đây là nguồn sự thật duy nhất
  // cho việc user đã authenticated hay chưa ở tầng edge/proxy.
  if (!sessionCookie) {
    return redirectToLogin(request, pathname);
  }

  // `session_data` là cookie cache optional — nếu có thì tận dụng để chặn
  // sớm các account không phải company. Nếu chưa có (mới login xong), để
  // request pass qua; server component sẽ populate nó ở request tiếp theo.
  const sessionData = parseSessionData(request);
  if (sessionData) {
    const user = sessionData.user as Record<string, unknown> | undefined;
    const accountType = user?.accountType as string | undefined;

    if (accountType && accountType !== "company") {
      return NextResponse.redirect(new URL("/unauthorized", request.url));
    }
  }

  return NextResponse.next();
}

export const config = {
  matcher: ["/((?!_next/static|_next/image|favicon.ico|robots.txt|sitemap.xml).*)"],
};
