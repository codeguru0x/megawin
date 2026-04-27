/**
 * Chuẩn hoá error message từ các source khác nhau về 1 format string duy nhất,
 * lưu vào `TenantDispatchOrderDoc.lastError`.
 *
 * Format:
 * - Tenant `success: false` (per-item / outer): `[CODE] message` (outer thêm prefix).
 * - HTTP/network/timeout: raw `err.message` (có thể đã chứa status code).
 *
 * Mục đích:
 * - UI stuck-orders hiển thị 1 cột duy nhất, staff đọc trực tiếp biết loại lỗi.
 * - Logging tool (Axiom) có thể regex trên field này để filter/alert.
 */

export interface TenantErrorShape {
  code?: string | null;
  message?: string | null;
}

/** Lỗi per-item hoặc outer response từ tenant `batchTransaction`. */
export function normalizeTenantError(
  err: TenantErrorShape | null | undefined,
  prefix = "",
): string {
  const message = err?.message?.trim() || "Item failed";
  const code = err?.code?.trim();
  const base = code ? `[${code}] ${message}` : message;
  return prefix ? `${prefix}${base}` : base;
}

/** Lỗi HTTP/network/timeout — throw từ client. */
export function normalizeHttpError(err: unknown): string {
  if (err instanceof Error) {
    return err.message || "HTTP error";
  }
  if (typeof err === "string") {
    return err;
  }
  return "HTTP error";
}

/**
 * Convenience: normalize theo context. Gọi method này để giữ format nhất quán
 * trong toàn use case.
 */
export function normalizeDispatchError(
  source:
    | { kind: "item"; error: TenantErrorShape | null | undefined }
    | { kind: "outer"; error: TenantErrorShape | null | undefined }
    | { kind: "http"; error: unknown },
): string {
  switch (source.kind) {
    case "item":
      return normalizeTenantError(source.error);
    case "outer":
      return normalizeTenantError(source.error, "Outer fail: ");
    case "http":
      return normalizeHttpError(source.error);
  }
}
