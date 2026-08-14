/**
 * Vitest setup: mock middleware infrastructure cho handler unit tests.
 *
 * `successEnvelopeMiddleware` và `validatorZodMiddleware` dùng BẢN THẬT qua `importOriginal` — cả
 * hai là pure transform (không I/O): một bọc raw output thành `{ success: true, data }`, một validate
 * bằng Zod schema rồi gán `event.schema`. Mock lại chỉ tạo rủi ro lệch so với production.
 *
 * VÌ SAO validator phải dùng bản thật (bài học 14/08/2026): mock cũ tự viết lại logic validate và
 * trả `{ success: false, error: { code: "BAD_REQUEST", message } }` — thiếu `details.errors[]` và
 * sai `code` (thật là `VALIDATION`). Vì test chỉ assert `statusCode === 400` chứ không assert body,
 * mock lệch shape vẫn xanh, nên bug envelope thật (body phẳng, client đọc ra `code: "UNKNOWN"`)
 * sống sót không ai thấy. Mock hạ tầng pure = tự bỏ lưới an toàn.
 */

import { vi } from "vitest";

vi.mock("@megawin/app-core/lambda/middleware", async (importOriginal) => {
  const actual = await importOriginal<typeof import("@megawin/app-core/lambda/middleware")>();

  return {
    successEnvelopeMiddleware: actual.successEnvelopeMiddleware,
    validatorZodMiddleware: actual.validatorZodMiddleware,
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
  };
});
