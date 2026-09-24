/**
 * Đọc giá trị từ API Gateway HTTP API v2 event — nguồn chân lý DUY NHẤT.
 *
 * Handler / middleware Lambda không tự parse `event.headers` hay
 * `requestContext`. Mọi field lấy từ event đi qua đây để lookup
 * case-insensitive và shape event thống nhất (không import `aws-lambda`).
 *
 *   - {@link getHeaderFromApiGatewayV2} — header bất kỳ, trim, case-insensitive.
 *   - {@link extractIdempotencyKeyFromApiGatewayV2} — `mw-idempotency-key` (bắt buộc).
 *   - {@link extractClientIpFromApiGatewayV2} — CHỈ `requestContext.http.sourceIp`.
 */

import { IDEMPOTENCY_KEY_HEADER } from "../constants/http-headers";
import { AppException } from "../errors/app-exception";

export { IDEMPOTENCY_KEY_HEADER };

/**
 * Headers dạng plain object. API Gateway v2 thường lowercase keys nhưng
 * lookup luôn case-insensitive — không giả định.
 */
export type ApiGatewayV2Headers = Record<string, string | undefined> | null | undefined;

/**
 * Shape tối thiểu của event API Gateway HTTP API v2.
 * Structural — `APIGatewayProxyEventV2` thật vẫn gán được, không kéo `aws-lambda`.
 */
export interface ApiGatewayV2EventSource {
  headers?: ApiGatewayV2Headers;
  requestContext?: {
    http?: {
      sourceIp?: string;
    };
    requestId?: string;
  };
}

/** Độ dài 8–128, charset `[A-Za-z0-9_-]`. Client thường gửi UUID. */
const IDEMPOTENCY_KEY_PATTERN = /^[A-Za-z0-9_-]{8,128}$/;

/**
 * Đọc 1 header từ event API Gateway v2 — case-insensitive, trim.
 *
 * @returns Giá trị đã trim, hoặc `undefined` nếu thiếu / rỗng / chỉ khoảng trắng.
 */
export function getHeaderFromApiGatewayV2(event: ApiGatewayV2EventSource, name: string): string | undefined {
  const headers = event.headers;
  if (!headers) {
    return undefined;
  }

  const wanted = name.toLowerCase();
  for (const [key, value] of Object.entries(headers)) {
    if (key.toLowerCase() === wanted) {
      const trimmed = value?.trim();
      return trimmed || undefined;
    }
  }

  return undefined;
}

/**
 * Đọc `mw-idempotency-key` từ event — bắt buộc trên `place-bet`.
 *
 * @throws {@link AppException} `BAD_REQUEST` khi thiếu header hoặc sai format.
 *   Không fallback sinh key server-side.
 */
export function extractIdempotencyKeyFromApiGatewayV2(event: ApiGatewayV2EventSource): string {
  const raw = getHeaderFromApiGatewayV2(event, IDEMPOTENCY_KEY_HEADER);
  if (raw == null) {
    throw AppException.badRequest("Thiếu header mw-idempotency-key. Vui lòng gửi lại yêu cầu kèm mã này.");
  }

  if (!IDEMPOTENCY_KEY_PATTERN.test(raw)) {
    throw AppException.badRequest(
      "Mã mw-idempotency-key không hợp lệ. Dùng 8–128 ký tự chữ, số, gạch ngang hoặc gạch dưới.",
    );
  }

  return raw;
}

/**
 * Peer IP TCP do API Gateway điền — client không spoof được.
 *
 * KHÔNG đọc header (`cf-connecting-ip` / `x-forwarded-for` / `x-real-ip`):
 * origin public trần, caller bypass Cloudflare tự set mọi header.
 * Trade-off: request qua CF thì `sourceIp` = IP edge CF. Forensic vẫn truy
 * về CF; đổi lại IP audit không bao giờ bị spoof.
 *
 * Chain header tin cậy (Next.js / nginx) nằm ở `extractClientIp` trong `./ip`.
 *
 * @returns Peer IP, hoặc `undefined` nếu event thiếu `sourceIp`.
 */
export function extractClientIpFromApiGatewayV2(event: ApiGatewayV2EventSource): string | undefined {
  return event.requestContext?.http?.sourceIp?.trim() || undefined;
}
