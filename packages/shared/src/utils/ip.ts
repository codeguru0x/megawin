/**
 * IP Address Extraction Utility — nguồn chân lý DUY NHẤT cho toàn hệ thống.
 *
 * Mọi nơi cần IP client (audit forensic, rate-limit, place-bet, auth hook) đều
 * đi qua đây để logic thống nhất. KHÔNG tự parse header rời rạc ở từng app.
 *
 * Fallback chain (thứ tự ưu tiên, dừng ở giá trị đầu tiên có mặt):
 *   1. `cf-connecting-ip`  — Cloudflare inject IP thực client, không thể giả mạo
 *                            (CF xoá header nếu client tự set trước khi vào edge).
 *   2. `x-forwarded-for`   — lấy phần tử ĐẦU (client gốc): "client, proxy1, proxy2".
 *   3. `x-real-ip`         — fallback nginx / reverse proxy đơn tầng.
 *
 * ⚠️ Chain trên (cả `cf-connecting-ip`) chỉ đáng tin sau trusted proxy
 * (nginx / Next.js edge / Cloudflare thực sự ghi đè header). Ở API Gateway v2
 * origin public trần: client bypass CF gọi thẳng có thể tự set MỌI header (kể cả
 * `cf-connecting-ip`) → {@link extractClientIpFromApiGatewayV2} cố tình bỏ qua
 * toàn bộ header, CHỈ dùng `requestContext.http.sourceIp` (peer IP TCP, không spoof).
 *
 * 3 entrypoint theo runtime — cùng nguồn logic nhưng KHÁC mức tin cậy:
 *   - {@link extractClientIp}             — plain object headers, full chain (proxy tin cậy).
 *   - {@link extractClientIpFromWebHeaders} — Web `Headers` (Next.js, better-auth hook), full chain.
 *   - {@link extractClientIpFromApiGatewayV2} — Lambda, CHỈ `sourceIp` (peer IP TCP, bỏ hết header).
 */

/**
 * HTTP request headers dạng plain object. Tương thích `event.headers` của
 * API Gateway (keys đã lowercase). Cho phép `null`/`undefined` để gọi an toàn.
 */
export type HttpHeaders = Record<string, string | undefined> | null | undefined;

/**
 * Shape tối thiểu của API Gateway HTTP API v2 event mà util này cần —
 * chỉ `requestContext.http.sourceIp` (peer IP TCP).
 *
 * `headers` để optional cho tương thích ngược: caller truyền nguyên
 * `APIGatewayProxyEventV2` vẫn gán được, nhưng
 * {@link extractClientIpFromApiGatewayV2} KHÔNG đọc header nào.
 *
 * Khai báo structural (không import `aws-lambda`) để `@megawin/shared` không
 * phải kéo dependency nặng; `APIGatewayProxyEventV2` thật vẫn gán được nhờ
 * structural typing của TypeScript.
 */
export interface ApiGatewayV2IpSource {
  headers?: HttpHeaders;
  requestContext?: {
    http?: {
      sourceIp?: string;
    };
  };
}

/**
 * Core: trích IP client từ plain-object headers theo fallback chain
 * `cf-connecting-ip` → `x-forwarded-for` (đầu) → `x-real-ip`.
 *
 * Chỉ đọc headers — không phụ thuộc cấu trúc event. Dùng được ở Lambda handler,
 * middleware, hoặc bất kỳ nơi nào có headers dạng object.
 *
 * @param headers - Headers dạng object (keys lowercase, như API Gateway chuẩn hoá).
 * @returns IP client, hoặc `undefined` nếu không header nào xác định được.
 */
export function extractClientIp(headers: HttpHeaders): string | undefined {
  if (!headers) return undefined;

  // cf-connecting-ip: Cloudflare inject IP thực client vào mọi request đến origin.
  // Không thể giả mạo — CF xoá header này nếu client tự set trước khi vào edge.
  const cfIp = headers["cf-connecting-ip"] ?? headers["CF-Connecting-IP"];
  if (cfIp) return cfIp.trim() || undefined;

  // x-forwarded-for: "client, proxy1, proxy2" — phần tử đầu là client gốc.
  const xForwardedFor = headers["x-forwarded-for"] ?? headers["X-Forwarded-For"];
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  // x-real-ip: fallback reverse proxy đơn tầng (nginx).
  const xRealIp = headers["x-real-ip"] ?? headers["X-Real-IP"];
  if (xRealIp) return xRealIp.trim() || undefined;

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
export function extractClientIpFromWebHeaders(
  headers: Headers | null | undefined,
): string | undefined {
  if (!headers) return undefined;

  const cfIp = headers.get("cf-connecting-ip");
  if (cfIp) return cfIp.trim() || undefined;

  const xForwardedFor = headers.get("x-forwarded-for");
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  return headers.get("x-real-ip")?.trim() || undefined;
}

/**
 * Adapter cho API Gateway HTTP API v2 event (Lambda handler) — CHỈ tin peer IP
 * TCP, KHÁC hẳn {@link extractClientIp}. Không đọc bất kỳ header nào.
 *
 * Tại Lambda, `requestContext.http.sourceIp` là **peer IP của kết nối TCP** mà
 * API Gateway nhìn thấy — client KHÔNG giả mạo được. Mọi header IP
 * (`cf-connecting-ip`, `x-forwarded-for`, `x-real-ip`) chỉ là giá trị client/
 * proxy tự set → spoof được, và ở đây origin là public trần: attacker gọi thẳng
 * API Gateway (bypass Cloudflare) có thể bơm `cf-connecting-ip: <bất kỳ>`. Không
 * có trusted proxy nội bộ nào ghi đè, nên KHÔNG tin header nào cả.
 *
 * Trade-off: khi request thực sự qua Cloudflare, `sourceIp` = IP edge CF (không
 * phải IP gốc client). Forensic vẫn truy được về CF; đổi lại IP audit KHÔNG BAO
 * GIỜ bị spoof. Nếu sau này khoá origin bằng shared secret / IP range CF, mới
 * cân nhắc tin lại `cf-connecting-ip`.
 *
 * @param event - API Gateway v2 event (chỉ cần `requestContext.http.sourceIp`).
 * @returns Peer IP TCP, hoặc `undefined` nếu event thiếu `sourceIp`.
 */
export function extractClientIpFromApiGatewayV2(event: ApiGatewayV2IpSource): string | undefined {
  // Chỉ dùng peer IP TCP do API Gateway điền — không spoof được.
  // KHÔNG đọc header (cf-connecting-ip/x-forwarded-for/x-real-ip): origin public
  // trần, client bypass CF có thể tự set mọi header → luôn spoof được.
  return event.requestContext?.http?.sourceIp?.trim() || undefined;
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
 * Trích {@link HttpRequestContext} từ plain-object headers (Lambda `event.headers`,
 * keys lowercase). `requestId` ưu tiên `x-request-id` → `x-amzn-trace-id`.
 *
 * @param headers - Headers dạng object (keys lowercase).
 * @returns `{ userAgent?, requestId? }` — mỗi field `undefined` nếu không có.
 */
export function extractHttpContext(headers: HttpHeaders): HttpRequestContext {
  if (!headers) return {};
  return {
    userAgent: cleanHeader(headers["user-agent"] ?? headers["User-Agent"]),
    requestId: cleanHeader(
      headers["x-request-id"] ??
        headers["X-Request-Id"] ??
        headers["x-amzn-trace-id"] ??
        headers["X-Amzn-Trace-Id"],
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
export function extractHttpContextFromWebHeaders(
  headers: Headers | null | undefined,
): HttpRequestContext {
  if (!headers) return {};
  return {
    userAgent: cleanHeader(headers.get("user-agent")),
    requestId: cleanHeader(headers.get("x-request-id") ?? headers.get("x-amzn-trace-id")),
  };
}
