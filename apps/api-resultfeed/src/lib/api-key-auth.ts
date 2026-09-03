/**
 * Middy middleware: xác thực server-to-server bằng API key CỐ ĐỊNH — cục bộ cho
 * `apps/api-resultfeed`, KHÔNG tái dùng `tenantApiKeyAuthMiddleware` của `@megawin/auth`
 * (đó gắn với ngữ nghĩa "tenant" — khái niệm B2B của MegaWin core; resultfeed có consumer
 * riêng của nó, không liên quan tenant).
 *
 * Đọc header `x-resultfeed-api-key`, so trực tiếp với `process.env.RESULTFEED_API_KEY`.
 * Sai/thiếu → `earlyResponse` 401 theo đúng format `ApiErrorResponse`.
 *
 * Chỉ 1 API key cho mọi consumer hiện tại (chưa xây danh sách nhiều consumer — mở rộng khi
 * có consumer thứ 2, VD MegaWin core PULL).
 */

import type { ApiErrorResponse } from "@megawin/shared/api-types";

const JSON_HEADERS = { "Content-Type": "application/json" };

function unauthorizedResponse(message: string) {
  const body: ApiErrorResponse = {
    success: false,
    error: { code: "UNAUTHORIZED", message },
  };
  return {
    statusCode: 401,
    headers: JSON_HEADERS,
    body: JSON.stringify(body),
  };
}

export function apiKeyAuthMiddleware() {
  return {
    before: async (request: { event: { headers?: Record<string, string | undefined> }; earlyResponse?: unknown }) => {
      const { event } = request;
      const apiKey = event.headers?.["x-resultfeed-api-key"];
      const expected = process.env.RESULTFEED_API_KEY;

      if (!expected) {
        // Env chưa cấu hình đúng — coi là lỗi vận hành, không phải lỗi của client.
        console.error("[api-resultfeed] RESULTFEED_API_KEY chưa được cấu hình.");
        request.earlyResponse = unauthorizedResponse("Service chưa cấu hình API key.");
        return;
      }

      if (!apiKey || apiKey !== expected) {
        request.earlyResponse = unauthorizedResponse("API key không hợp lệ hoặc thiếu (header x-resultfeed-api-key).");
        return;
      }
    },
  };
}
