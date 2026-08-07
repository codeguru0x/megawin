/**
 * Vitest setup: mock middleware infrastructure cho handler unit tests.
 *
 * validatorZodMiddleware validate body/path/query bằng schema thật,
 * trả earlyResponse 400 nếu validation fail.
 *
 * Lưu ý: `tenantAuth` (@megawin/auth/tenant) tra API key qua MongoDB
 * (TenantRepository) — KHÔNG mock global ở đây vì mỗi test có thể cần
 * assert case tenant hợp lệ/không hợp lệ khác nhau. Mock riêng theo từng
 * file test bằng `vi.mock("@megawin/auth/tenant", ...)`.
 */

import { vi } from "vitest";

vi.mock("@megawin/app-core/lambda/middleware", () => ({
  validatorZodMiddleware: (schemas: { body?: any; path?: any; query?: any }) => ({
    before: async (request: { event: Record<string, any>; earlyResponse?: unknown }) => {
      const event = request.event;
      const parsed: Record<string, unknown> = {};

      try {
        const rawBody = event.body ? JSON.parse(event.body as string) : {};
        parsed.body = schemas.body ? schemas.body.parse(rawBody) : rawBody;
        parsed.path = schemas.path
          ? schemas.path.parse(event.pathParameters ?? {})
          : (event.pathParameters ?? {});
        parsed.query = schemas.query
          ? schemas.query.parse(event.queryStringParameters ?? {})
          : (event.queryStringParameters ?? {});
      } catch (err: any) {
        request.earlyResponse = {
          statusCode: 400,
          headers: { "Content-Type": "application/json" },
          body: JSON.stringify({
            success: false,
            error: { code: "BAD_REQUEST", message: err.message ?? "Validation failed" },
          }),
        };
        return;
      }

      event.schema = parsed;
    },
  }),
  httpErrorHandlerUseCaseFormat: () => ({
    onError: (request: { error: unknown; response?: unknown }) => {
      const err = request.error;
      request.response = {
        statusCode: 500,
        headers: { "Content-Type": "application/json" },
        body: JSON.stringify({
          success: false,
          error: {
            code: "INTERNAL",
            message: err instanceof Error ? err.message : "Unknown error",
          },
        }),
      };
    },
  }),
}));
