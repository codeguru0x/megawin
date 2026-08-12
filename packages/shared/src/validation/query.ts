/**
 * Query String – Zod helpers cho query param dùng chung toàn hệ thống.
 *
 * Import: @megawin/shared/validation
 */

import { z } from "zod";

/**
 * Zod schema cho query param mang **NHIỀU giá trị** (multi-value) → mảng đã validate.
 *
 * ## Vì sao cần helper này (bối cảnh AWS HTTP API — payload format 2.0)
 *
 * Toàn bộ `api-player` deploy dưới `httpApi` (API Gateway **HTTP API**, payload `2.0`).
 * Payload 2.0 **KHÔNG có** field `multiValueQueryStringParameters` (khác REST API v1) —
 * mọi query param trùng key được AWS **nối bằng dấu phẩy** vào chính `queryStringParameters`:
 *
 * - Client gửi repeated param  `?numbers=01&numbers=05&numbers=12`
 * - HOẶC gửi CSV thuần          `?numbers=01,05,12`
 * - → Lambda đều nhận **cùng một** `queryStringParameters.numbers === "01,05,12"`.
 *
 * Helper nhận CHUNG cho cả 2 kiểu client: `split(",")` → `trim` → bỏ phần tử rỗng
 * (chống trailing comma / khoảng trắng) → `pipe` vào `arraySchema` do caller cung cấp để
 * validate. Vì `arraySchema` là `z.array(...)` dựng sẵn nên `.min()/.max()/.refine()` khai
 * báo tự nhiên ngay tại call-site (KHÔNG thể chain sau helper vì `ZodPipe` không có `.min`).
 *
 * ## LƯU Ý QUAN TRỌNG về type — mọi phần tử ĐỒNG NHẤT một kiểu
 *
 * Query string là text thô: URL không có khái niệm "số". AWS luôn giao chuỗi
 * (`"01,05,12"`), helper split ra `["01","05","12"]` — **toàn bộ là `string`**. Không thể
 * để "phần tử này string, phần tử kia number" vì tất cả sinh ra từ cùng một chuỗi.
 * `itemSchema` bên trong `arraySchema` do CALLER quyết định kiểu, áp cho CẢ mảng:
 *
 * - Phần tử là string (VD số xổ số zero-padded `"01".."55"`): `z.array(z.string()...)`.
 * - Phần tử là số nguyên (VD `?ids=1,2,3`): item phải NHẬN string rồi ép sang number —
 *   `z.array(z.string().pipe(z.coerce.number().int()))` (input mỗi phần tử LUÔN là string).
 *
 * Ràng buộc generic ép item schema có **input `string`** — phản ánh đúng bản chất "query là
 * text thô", đồng thời giúp `.pipe` type-check khớp (`string[]` → `string[]`).
 *
 * @param arraySchema - `z.array(itemSchema)` (kèm `.min()/.max()/.refine()` nếu cần), với
 *   `itemSchema` nhận input `string`. Chịu trách nhiệm ép/validate từng phần tử.
 * @returns `ZodPipe` cho mảng đã validate.
 *
 * @example
 * // Query string items — số xổ số zero-padded, giữ nguyên string
 * const querySchema = z.object({
 *   numbers: multiValueQuery(z.array(power655MainNumberSchema).min(5).max(18)),
 * });
 * // ?numbers=01,05,12  →  { numbers: ["01", "05", "12"] }
 *
 * @example
 * // Query int items — item nhận string rồi ép số
 * const querySchema = z.object({
 *   ids: multiValueQuery(z.array(z.string().pipe(z.coerce.number().int().positive()))),
 * });
 * // ?ids=1,2,3  →  { ids: [1, 2, 3] }
 */
export function multiValueQuery<T extends z.ZodArray<z.ZodType<unknown, string>>>(arraySchema: T) {
  return z
    .string()
    .transform((raw) =>
      raw
        .split(",")
        .map((v) => v.trim())
        .filter(Boolean),
    )
    .pipe(arraySchema);
}
