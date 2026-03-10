/**
 * IP Address Extraction Utility
 *
 * Trích xuất IP client từ HTTP request headers. Không cần Cloudflare.
 *
 * Fallback chain (từ headers):
 *   1. CF-Connecting-IP  — Cloudflare inject IP thực client, không thể giả mạo
 *   2. X-Forwarded-For   — lấy phần tử ĐẦU TIÊN (client gốc)
 *
 * Khi không qua Cloudflare (e.g. API Gateway custom domain trực tiếp):
 *   - Headers trên sẽ không có → trả về `undefined`
 *   - Dùng `requestContext.http.sourceIp` (HTTP API v2) trực tiếp ở handler
 */

/**
 * HTTP request headers. Tương thích với `event.headers` của API Gateway (lowercase keys).
 */
export type HttpHeaders = Record<string, string | undefined> | null | undefined;

/**
 * Trích xuất IP client từ request headers.
 *
 * Chỉ đọc từ headers — không phụ thuộc vào cấu trúc event cụ thể.
 * Có thể dùng ở Lambda handler, middleware, hoặc bất kỳ nơi nào có headers.
 *
 * Khi đứng sau Cloudflare: `cf-connecting-ip` chứa IP thực client.
 * Khi không qua Cloudflare: trả về `undefined` — handler tự lấy từ `requestContext.http.sourceIp`.
 *
 * API Gateway HTTP API v2 chuẩn hóa tất cả headers sang lowercase.
 */
export function extractClientIp(headers: HttpHeaders): string | undefined {
  if (!headers) return undefined;

  // CF-Connecting-IP: Cloudflare inject IP thực client vào mọi request đến origin.
  // Không thể giả mạo vì CF xóa header này nếu client tự set trước khi vào CF edge.
  const cfIp = headers["cf-connecting-ip"] ?? headers["CF-Connecting-IP"];
  if (cfIp) return cfIp.trim();

  // X-Forwarded-For: "client, proxy1, proxy2" — IP đầu tiên là client gốc.
  const xForwardedFor = headers["x-forwarded-for"] ?? headers["X-Forwarded-For"];
  if (xForwardedFor) {
    const firstIp = xForwardedFor.split(",")[0]?.trim();
    if (firstIp) return firstIp;
  }

  return undefined;
}
