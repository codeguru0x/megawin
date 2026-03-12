/**
 * Tiện ích format ApiClientError → { title, description } để hiển thị trên toast/UI web.
 *
 * Khi API trả validation errors dạng:
 *   { details: { errors: [{ field, message }] } }
 *
 * Hàm gộp tất cả lỗi vào 1 object duy nhất:
 *   - title   = message chính (hoặc fallback nếu không phải ApiClientError)
 *   - description = bullet list các lỗi chi tiết (chỉ có khi có ≥1 lỗi field)
 *
 * @example
 * onError: (err) => {
 *   const { title, description } = formatErrorToast(err, "Thao tác thất bại.");
 *   toast.error(title, { description });
 * }
 */

import { ApiClientError } from "@megawin/shared/api-types";

export interface ErrorToast {
  /** Tiêu đề chính của toast (ngắn gọn). */
  title: string;
  /** Chi tiết từng lỗi — hiển thị dưới title, dạng bullet list. Undefined nếu không có. */
  description?: string;
}

/**
 * Chuyển error từ mutation/fetch thành { title, description } cho toast.
 *
 * - Lỗi không phải ApiClientError → trả fallback.
 * - Lỗi không có details.errors   → title = err.message.
 * - 1 lỗi có field                → description = "field: message".
 * - Nhiều lỗi                     → description = bullet list "• field: message".
 */
export function formatErrorToast(err: unknown, fallback: string): ErrorToast {
  if (!(err instanceof ApiClientError)) return { title: fallback };

  const details = err.details as { errors?: Array<{ field: string; message: string }> } | undefined;
  const errors = details?.errors;

  if (!errors || errors.length === 0) return { title: err.message };

  if (errors.length === 1) {
    const e = errors[0]!;
    // Field rỗng = form-level error → dùng message làm title trực tiếp
    return e.field
      ? { title: err.message, description: `${e.field}: ${e.message}` }
      : { title: e.message };
  }

  // Nhiều lỗi: gộp thành bullet list
  const description = errors
    .map((e) => (e.field ? `• ${e.field}: ${e.message}` : `• ${e.message}`))
    .join("\n");
  return { title: err.message, description };
}
