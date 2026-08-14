/**
 * Entrypoint cho Middy middleware dùng trong Lambda.
 *
 * ╔══════════════════════════════════════════════════════════════════════════════════════╗
 * ║ PHÂN LOẠI BẮT BUỘC ĐỌC: middleware HTTP-ONLY vs WORKER-SAFE                         ║
 * ╚══════════════════════════════════════════════════════════════════════════════════════╝
 *
 * Monorepo có 2 loại Lambda với ngữ nghĩa response NGƯỢC NHAU:
 *
 * 1. **Lambda HTTP** (`apps/api-player`, `apps/api-tenant`) — API Gateway proxy integration.
 *    Response phải là `{ statusCode, headers, body: string }`. Lỗi phải BIẾN THÀNH response
 *    (status 4xx/5xx) để client nhận JSON chuẩn. Dùng wrapper `withPlayerAuth`/`withTenantAuth`/
 *    `withPublicHandler` từ `@megawin/auth` — đã tự gắn đủ middleware, KHÔNG tự `.use()` thủ công.
 *
 * 2. **Lambda worker** (`apps/worker-*`) — Step Function / EventBridge / SQS.
 *    Return value là DATA THÔ cho state kế tiếp đọc qua `$states.result`
 *    (xem `apps/worker-keno/src/step-functions/settle.ts`). Lỗi phải THROW RA để Step Function
 *    kích hoạt `Retry`/`Catch`. Hiện worker KHÔNG dùng middy — pattern thuần
 *    `export async function handler(event) { return useCase.run(event); }`.
 *
 * ── HTTP-ONLY — TUYỆT ĐỐI KHÔNG dùng cho worker ──────────────────────────────────────
 *
 * | Middleware                       | Vì sao worker KHÔNG được dùng                        |
 * |----------------------------------|------------------------------------------------------|
 * | `successEnvelopeMiddleware`      | Bọc output thành `{ success, data }` → Step Function |
 * |                                  | phải đọc `$states.result.data`, phá toàn bộ ASL      |
 * | `httpErrorHandlerUseCaseFormat`  | **NGUY HIỂM NHẤT** — NUỐT lỗi: gán `request.response`|
 * |                                  | và KHÔNG re-throw. Worker sẽ kết thúc THÀNH CÔNG dù  |
 * |                                  | lỗi → `Retry`/`Catch` không kích hoạt → sai tiền âm  |
 * |                                  | thầm trong settle/payout                             |
 * | `validatorZodMiddleware`         | Parse `event.body` (JSON string) + `pathParameters` +|
 * |                                  | `queryStringParameters` — thuần khái niệm HTTP        |
 *
 * ── WORKER-SAFE — không phụ thuộc shape HTTP ─────────────────────────────────────────
 *
 * `sqsParserMiddleware`, `snsParserMiddleware`, `kinesisParserMiddleware`,
 * `stepFunctionParserMiddleware` chỉ đọc/chuẩn hoá event vào `event.parsed`, không đụng
 * `request.response` → an toàn cho worker.
 *
 * Lưu ý: 4 parser này hiện CHƯA có consumer nào trong repo (worker đang dùng pattern thuần).
 * Giữ lại làm building block cho wrapper worker tương lai. Nếu xây wrapper đó, middleware error
 * PHẢI theo ngữ nghĩa "log rồi RE-THROW", KHÔNG tái dùng `httpErrorHandlerUseCaseFormat`.
 *
 * ── KHÔNG viết middleware chống Lambda timeout — middy làm sẵn ────────────────────────
 *
 * `@middy/core` 7.2.1 có `timeoutEarlyInMillis` (default `5`) + `timeoutEarlyResponse`, đã
 * BẬT MẶC ĐỊNH. Nó `Promise.race([handlerResult, timeoutPromise])` nên không chặn handler.
 * Muốn đổi buffer/response thì truyền plugin config lúc khởi tạo `middy(handler, {...})`.
 *
 * (Từng có `lambda-timeout-protection.ts` tự làm việc này qua hook `before` → deadlock:
 * `before` trả Promise chỉ resolve ở `after`, mà `after` chỉ chạy sau handler, mà handler
 * chỉ chạy sau khi mọi `before` xong. Đo thực tế: `handlerRan=false`, luôn throw timeout.
 * Đã xoá — đừng viết lại pattern đó.)
 *
 * === Auth middleware — đã chuyển sang @megawin/auth ===
 * import { withPlayerAuth, withAgentAuth, withCompanyAuth } from "@megawin/auth";
 * import { withTenantAuth } from "@megawin/auth/tenant";
 */

/** Error handler — HTTP-ONLY (nuốt lỗi thành response; xem cảnh báo đầu file). */
export { httpErrorHandlerUseCaseFormat } from "./http-error-handler-use-case";
/** Kinesis parser — worker-safe. */
export { kinesisParserMiddleware, parseKinesisData } from "./kinesis-parser";
/** SNS parser — worker-safe. */
export { parseSnsMessage, snsParserMiddleware } from "./sns-parser";
/** SQS parser — worker-safe. */
export { parseSqsBody, sqsParserMiddleware } from "./sqs-parser";
/** Step Function parser — worker-safe. */
export { stepFunctionParserMiddleware } from "./step-function-parser";
/** Success envelope — HTTP-ONLY (bọc `{ success, data }`; xem cảnh báo đầu file). */
export { successEnvelopeMiddleware } from "./success-envelope";
/** Zod validator — HTTP-ONLY (parse body/path/query của API Gateway). */
export {
  type ApiGatewayZodSchemas,
  type SchemaOf,
  validatorZodMiddleware,
} from "./validator-zod";
