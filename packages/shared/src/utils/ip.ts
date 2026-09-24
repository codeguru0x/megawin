/**
 * IP Address Extraction Utility — nguồn chân lý cho IP sau trusted proxy
 * (Next.js / nginx / Cloudflare ghi đè header).
 *
 * Mọi nơi cần IP client từ header (audit forensic, auth hook) đi qua đây.
 * KHÔNG tự parse header rời rạc ở từng app.
 *
 * Fallback chain (thứ tự ưu tiên, dừng ở giá trị đầu tiên có mặt):
 *   1. `cf-connecting-ip`  — Cloudflare inject IP thực client, không thể giả mạo
 *                            (CF xoá header nếu client tự set trước khi vào edge).
 *   2. `x-forwarded-for`   — lấy phần tử ĐẦU (client gốc): "client, proxy1, proxy2".
 *   3. `x-real-ip`         — fallback nginx / reverse proxy đơn tầng.
 *
 * ⚠️ Chain trên chỉ đáng tin sau trusted proxy. Lambda API Gateway v2 origin
 * public trần: client bypass CF tự set mọi header → IP Lambda **không** lấy ở
 * đây. Dùng `extractClientIpFromApiGatewayV2` trong `./api-gateway-v2`
 * (chỉ `requestContext.http.sourceIp`).
 *
 * 2 entrypoint header (proxy tin cậy):
 *   - {@link extractClientIp}               — plain object headers, full chain.
 *   - {@link extractClientIpFromWebHeaders} — Web `Headers` (Next.js, better-auth).
 */

/**
 * HTTP request headers dạng plain object (Next.js / nginx / hook).
 * Cho phép `null`/`undefined` để gọi an toàn.
 * Header từ Lambda event: dùng `getHeaderFromApiGatewayV2` trong `./api-gateway-v2`.
 */
export type HttpHeaders = Record<string, string | undefined> | null | undefined;

/**
 * Core: trích IP client từ plain-object headers theo fallback chain
 * `cf-connecting-ip` → `x-forwarded-for` (đầu) → `x-real-ip`.
 *
 * Chỉ đọc headers sau trusted proxy — không phụ thuộc cấu trúc event.
 * IP Lambda: `extractClientIpFromApiGatewayV2` trong `./api-gateway-v2`.
 *
 * @param headers - Headers dạng object (Next.js / nginx).
 * @returns IP client, hoặc `undefined` nếu không header nào xác định được.
 */
export function extractClientIp(headers: HttpHeaders): string | undefined {
  if (!headers) {
    return undefined;
  }

  // cf-connecting-ip: Cloudflare inject IP thực client vào mọi request đến origin.
  // Không thể giả mạo — CF xoá header này nếu client tự set trước khi vào edge.
  const cfIp = headers["cf-connecting-ip"] ?? headers["CF-Connecting-IP"];
  if (cfIp) {
    return cfIp.trim() || undefined;
  }

  // x-forwarded-for: "client, proxy1, proxy2" — phần tử đầu là client gốc.
  const xForwardedFor = headers["x-forwarded-for"] ?? headers["X-Forwarded-For"];
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  // x-real-ip: fallback reverse proxy đơn tầng (nginx).
  const xRealIp = headers["x-real-ip"] ?? headers["X-Real-IP"];
  if (xRealIp) {
    return xRealIp.trim() || undefined;
  }

  return undefined;
}

/**
 * Adapter cho Web `Headers` (Next.js route handler, better-auth hook `ctx.headers`).
 *
 * Web `Headers` chuẩn hoá keys sang lowercase và truy cập qua `.get()`, nên chỉ
 * cần thử lowercase. Cùng fallback chain với {@link extractClientIp}.
 *
 * @param headers - Web `Headers` (`request.headers`, `ctx.headers`).
 * @returns IP client, hoặc `undefined`.
 */
export function extractClientIpFromWebHeaders(headers: Headers | null | undefined): string | undefined {
  if (!headers) {
    return undefined;
  }

  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) {
    return cfIp.trim() || undefined;
  }

  const xForwardedFor = headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(",")[0]?.trim();
    if (firstIp) {
      return firstIp;
    }
  }

  return headers.get("x-real-ip")?.trim() || undefined;
}

/**
 * HTTP context KHÔNG index của request — `userAgent` + `requestId`.
 *
 * Song hành với IP nhưng KHÁC bản chất: đây là các field **chỉ hiển thị +
 * correlation**, KHÔNG dùng filter forensic nên KHÔNG cần chống spoof gắt như
 * `ip`. Chấp nhận đọc thẳng từ header ở mọi runtime (kể cả API Gateway v2) —
 * spoof `user-agent` chả có giá trị gì cho attacker, còn `requestId` chỉ để tra chéo.
 *
 * Khai `interface` cục bộ (không import `AuditHttpContext` từ `@megawin/audit`) để
 * `@megawin/shared` KHÔNG phụ thuộc ngược lên audit — shape trùng nhau nên caller
 * gán thẳng vào actor được nhờ structural typing.
 */
export interface HttpRequestContext {
  /** User-Agent thô từ header `user-agent`. `undefined` nếu thiếu. */
  userAgent?: string;
  /** Trace/request id: `x-request-id` → `x-amzn-trace-id`. `undefined` nếu thiếu. */
  requestId?: string;
}

/** Chuẩn hoá 1 giá trị header thô → trimmed string hoặc `undefined`. */
function cleanHeader(value: string | undefined | null): string | undefined {
  return value?.trim() || undefined;
}

/**
 * Trích {@link HttpRequestContext} từ plain-object headers (Next.js / hook).
 * `requestId` ưu tiên `x-request-id` → `x-amzn-trace-id`.
 *
 * @param headers - Headers dạng object (keys lowercase).
 * @returns `{ userAgent?, requestId? }` — mỗi field `undefined` nếu không có.
 */
export function extractHttpContext(headers: HttpHeaders): HttpRequestContext {
  if (!headers) {
    return {};
  }
  return {
    userAgent: cleanHeader(headers["user-agent"] ?? headers["User-Agent"]),
    requestId: cleanHeader(
      headers["x-request-id"] ?? headers["X-Request-Id"] ?? headers["x-amzn-trace-id"] ?? headers["X-Amzn-Trace-Id"],
    ),
  };
}

/**
 * Adapter cho Web `Headers` (Next.js route handler, better-auth hook `ctx.headers`).
 * Cùng logic với {@link extractHttpContext}.
 *
 * @param headers - Web `Headers` (`request.headers`, `ctx.headers`).
 * @returns `{ userAgent?, requestId? }`.
 */
export function extractHttpContextFromWebHeaders(headers: Headers | null | undefined): HttpRequestContext {
  if (!headers) {
    return {};
  }
  return {
    userAgent: cleanHeader(headers.get("user-agent")),
    requestId: cleanHeader(headers.get("x-request-id") ?? headers.get("x-amzn-trace-id")),
  };
}
