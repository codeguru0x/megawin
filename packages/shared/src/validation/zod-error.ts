/**
 * Zod Error – format `ZodError.issues` thành shape mà client đọc được.
 *
 * Import: `@megawin/shared/validation`
 *
 * Đây là **nguồn chân lý DUY NHẤT** cho việc dịch lỗi Zod thành payload API, dùng chung bởi mọi
 * interface: Next.js API route (`packages/next` — `validationError`), Lambda/API Gateway
 * (`packages/app-core/src/lambda/middleware/validator-zod.ts`), và mọi consumer tương lai (AI
 * tool-call, worker…). Đặt ở `shared` vì nó là **contract wire-protocol**, không thuộc framework nào.
 *
 * VÌ SAO phải dùng chung: shape `{ field, message }` là hợp đồng với FE
 * (`packages/next/src/client/format-error-toast.ts` đọc `details.errors[]` để render bullet list
 * theo từng field). Trước đây Lambda và Next mỗi bên tự viết một bản `reduce` giống nhau gần như
 * nguyên văn — sửa notation ở 1 bên là FE của bên kia lệch âm thầm, không có compiler nào bắt.
 */

import type { ZodError } from "zod";

/**
 * Một lỗi validation đã format, gắn với 1 field cụ thể.
 *
 * Shape này đi thẳng ra response API nên **đổi là BREAKING với FE và tenant SDK**.
 */
export interface ZodFieldError {
  /**
   * Đường dẫn tới field lỗi theo notation quen thuộc (xem {@link formatZodIssuePath}).
   *
   * Rỗng (`""`) khi lỗi ở cấp object (vd `.refine()` trên cả schema) — FE hiểu là lỗi
   * không gắn field nào và chỉ hiện `message`.
   */
  field: string;
  /** Message do Zod schema sinh ra, đã là tiếng Việt nếu schema khai báo vậy. */
  message: string;
}

/**
 * Build `field` string từ `issue.path` của Zod.
 *
 * - `["draws", 0, "drawTime"]` → `"draws[0].drawTime"`
 * - `["email"]`                → `"email"`
 * - `[]`                       → `""` (lỗi cấp root)
 *
 * KHÔNG đổi `[]` thành `"root"` hay placeholder khác — FE dựa vào chuỗi rỗng để biết
 * đây là form-level error và chỉ hiện message.
 *
 * `symbol` có trong type vì Zod cho phép key symbol; `String(segment)` xử lý an toàn.
 */
export function formatZodIssuePath(path: readonly (string | number | symbol)[]): string {
  return path.reduce<string>((acc, segment, i) => {
    if (typeof segment === "number") {
      return `${acc}[${segment}]`;
    }
    return i === 0 ? String(segment) : `${acc}.${String(segment)}`;
  }, "");
}

/**
 * Map toàn bộ `ZodError.issues` thành mảng `{ field, message }`.
 *
 * @example
 * const result = schema.safeParse(input);
 * if (!result.success) {
 *   const errors = formatZodIssues(result.error);
 *   // → [{ field: "boards[0].numbers", message: "Phải chọn đúng 6 số." }]
 * }
 */
export function formatZodIssues(error: ZodError): ZodFieldError[] {
  return error.issues.map((issue) => ({
    field: formatZodIssuePath(issue.path),
    message: issue.message,
  }));
}

/**
 * Nhận diện `ZodError` bằng **shape** (`issues` là array) thay vì `instanceof`.
 *
 * VÌ SAO không `instanceof ZodError`: các package trong monorepo có thể resolve 2 instance zod
 * khác nhau (pnpm hoisting, version range lệch) → `instanceof` fail âm thầm, lỗi validation tụt
 * xuống nhánh xử lý lỗi chung và client mất thông tin field. Check shape miễn nhiễm chuyện đó.
 *
 * Bắt buộc kiểm `Array.isArray(issues)`: một object bất kỳ có field `issues` (vd DTO nghiệp vụ
 * trùng tên) mà lọt vào {@link formatZodIssues} sẽ ném `TypeError` NGAY TRONG error path — biến
 * lỗi 400 đọc được thành 500 mất dấu. Đây là lý do hàm này tồn tại thay vì `"issues" in value`.
 */
export function isZodErrorLike(value: unknown): value is ZodError {
  return typeof value === "object" && value !== null && "issues" in value && Array.isArray(value.issues);
}
