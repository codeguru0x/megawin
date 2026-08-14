/**
 * Middy `after`: bọc raw return value từ handler thành API Gateway response chuẩn
 * `{ success: true, data }` status 200.
 *
 * Đây là facade tương đương `apiSuccess()` tự động của Next.js `ApiRouteBuilder.handler()` —
 * cho phép handler Lambda `return useCase.run(input)` thẳng (raw output O), không phải tự
 * gọi `toApiGatewayResponse()` mỗi lần.
 *
 * ── CHỈ DÙNG CHO HANDLER HTTP (API Gateway) ────────────────────────────────────────────
 * Middleware này gán `request.response` thành shape `{ statusCode, headers, body }` — shape
 * RIÊNG của API Gateway proxy integration. Worker Lambda (Step Function / EventBridge / SQS)
 * KHÔNG được dùng: Step Function đọc `$states.result` làm data thô cho state kế tiếp
 * (xem `apps/worker-keno/src/step-functions/settle.ts` — `Assign: { settleCtx: "{% $states.result %}" }`),
 * nếu bị bọc envelope thì state sau phải đọc `$states.result.data` → phá toàn bộ ASL definition.
 */

import type { ApiSuccessResponse } from "@megawin/shared/api-types";

import type { ApiGatewayResponse } from "../../use-cases/api-gateway";

const JSON_HEADERS = { "Content-Type": "application/json" };

/**
 * Nhận biết handler đã tự trả về `ApiGatewayResponse` tường minh hay chưa.
 *
 * Duck-typing 2 field bắt buộc của API Gateway proxy response: `statusCode` (number) +
 * `body` (string). Kiểm `body` phải là STRING là điểm phân biệt then chốt — raw output của
 * `UseCase` có thể tình cờ có field `statusCode` (vd DTO mô tả trạng thái đơn), nhưng gần như
 * không bao giờ đồng thời có `body` dạng string đã JSON.stringify.
 */
function isApiGatewayResponse(value: unknown): value is ApiGatewayResponse {
  return (
    typeof value === "object" &&
    value !== null &&
    typeof (value as ApiGatewayResponse).statusCode === "number" &&
    typeof (value as ApiGatewayResponse).body === "string"
  );
}

/**
 * Tạo middleware bọc success envelope.
 *
 * Chạy ở hook `after` — tức CHỈ khi handler đã return thành công. Hai trường hợp KHÔNG đi qua
 * đây (middy tự bỏ qua `after` stack):
 * 1. Handler throw → middy nhảy sang `onError` (`httpErrorHandlerUseCaseFormat` lo envelope lỗi).
 * 2. Middleware `before` set `earlyResponse` (vd auth trả 401) → middy short-circuit,
 *    KHÔNG chạy `after` (đã verify tại `@middy/core@7.2.1/index.js`: lời gọi
 *    `runMiddlewares(afterMiddlewares)` nằm bên trong `if (!("earlyResponse" in request))`).
 *    Nhờ vậy response 401 của auth không bị bọc lại thành `{ success: true }`.
 */
export function successEnvelopeMiddleware() {
  return {
    after: (request: { response?: unknown }) => {
      const { response } = request;

      // ESCAPE HATCH — handler đã tự dựng response HTTP hoàn chỉnh thì PASS-THROUGH, không bọc lại.
      //
      // Bọc lại sẽ tạo double-envelope: `{ success: true, data: { statusCode: 201, body: "{\"success\":true,...}" } }`
      // → client nhận status 200 kèm body lồng nhau, mất hẳn status/headers gốc.
      //
      // Sau Phase 4 (mọi use-case đã là `UseCase` raw output, `ApiGatewayUseCase` đã xoá), guard
      // này KHÔNG còn phục vụ base class deprecated nào nữa — chỉ còn 2 nguồn hợp lệ, đều là
      // handler CHỦ ĐỘNG dựng response:
      // 1. Handler gọi `toApiGatewayResponse()` tường minh để đặt status/headers khác chuẩn
      //    (redirect 302, Location header, custom Cache-Control…).
      // 2. Handler cần trả status ngoài 200 (vd 204 No Content) — envelope mặc định luôn 200.
      //
      // KHÔNG xoá guard: nó là hợp đồng công khai của escape hatch. Bỏ đi thì mọi response
      // tường minh sẽ bị bọc 2 lần.
      if (isApiGatewayResponse(response)) {
        return;
      }

      // Raw output từ `UseCase.run()` → bọc envelope chuẩn, status luôn 200.
      // `data` giữ nguyên giá trị (kể cả null/array/primitive) để client parse nhất quán.
      const body: ApiSuccessResponse<unknown> = { success: true, data: response };
      request.response = {
        statusCode: 200,
        headers: JSON_HEADERS,
        body: JSON.stringify(body),
      };
    },
  };
}
