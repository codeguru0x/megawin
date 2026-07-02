/**
 * Opaque cursor codec — dùng chung cho MỌI cursor pagination trong hệ thống.
 *
 * ## Vì sao opaque?
 *
 * Best practice cursor pagination: client PHẢI coi cursor là chuỗi mờ, không tự
 * dựng/parse/sửa. Phơi bày cursor thô (ISO timestamp, Mongo ObjectId, id hex…)
 * lên URL sẽ: lộ implementation (DB nào, sort theo cột gì), cho phép user sửa
 * tay, và khoá cứng encoding vào URL đã share — đổi khoá sort sau này là breaking.
 *
 * Codec này encode cursor value (bất kỳ shape JSON-serializable nào) thành
 * **base64url** — URL-safe, không cần percent-encode. Đổi shape cursor sau này
 * (scalar → compound, thêm khoá sort) KHÔNG phá URL cũ vì client không hề biết
 * bên trong là gì.
 *
 * ## Generic theo họ cursor
 *
 * Phủ cả hai họ mà {@link CursorPage} định nghĩa:
 * - **Scalar** — `encodeCursor("64f...")`, `encodeCursor(42)`.
 * - **Compound** — `encodeCursor({ ts: "2026-…", id: "64f…" })`.
 *
 * ## Vị trí trong pipeline
 *
 * Chỉ dùng ở tầng route (biên giới HTTP):
 * - **encode** sau use-case: `page.nextCursor` → opaque string trả FE.
 * - **decode** trong Zod schema: opaque string → cursor value cho use-case.
 *
 * Use-case + repo giữ nguyên cursor object/scalar — không đụng tới opaque.
 *
 * @example Route serialize output
 * ```ts
 * return { data: page.data, nextCursor: encodeCursor(page.nextCursor) };
 * ```
 *
 * @example Zod schema decode input (compound cursor, có validate shape)
 * ```ts
 * cursor: z.string().min(1).optional().transform((token) =>
 *   decodeCursor(token, (v): v is { ts: string; id: string } =>
 *     typeof v === "object" && v !== null && "ts" in v && "id" in v),
 * ),
 * ```
 */

/** Base64 → base64url (URL-safe, bỏ padding `=`). */
function toBase64Url(b64: string): string {
  return b64.replace(/\+/g, "-").replace(/\//g, "_").replace(/=+$/, "");
}

/** Base64url → base64 (khôi phục ký tự + padding để Buffer decode). */
function fromBase64Url(b64url: string): string {
  const b64 = b64url.replace(/-/g, "+").replace(/_/g, "/");
  const pad = b64.length % 4 === 0 ? "" : "=".repeat(4 - (b64.length % 4));
  return b64 + pad;
}

/**
 * Encode cursor value → opaque base64url token cho FE.
 *
 * `null` in → `null` out (hết trang) — truyền thẳng vào response `nextCursor`.
 *
 * @typeParam TCursor - Kiểu cursor của trang (scalar hoặc compound object)
 * @param cursor - `page.nextCursor` từ {@link CursorPage}; `null` = hết trang
 * @returns Token opaque base64url, hoặc `null` nếu `cursor` null
 */
export function encodeCursor<TCursor>(cursor: TCursor | null): string | null {
  if (cursor === null || cursor === undefined) return null;
  return toBase64Url(Buffer.from(JSON.stringify(cursor), "utf8").toString("base64"));
}

/**
 * Decode opaque token → cursor value cho use-case.
 *
 * Fail-safe: token rỗng/hỏng/không JSON → trả `null` (coi như trang đầu) thay vì
 * throw. Client không được phép tự dựng cursor, nên input sai chỉ bị bỏ qua —
 * không làm crash request.
 *
 * Truyền `validate` để kiểm shape sau parse (vd ObjectId hex hợp lệ, đủ field);
 * validate fail → cũng trả `null`. Bỏ `validate` nếu tin cấu trúc (scalar đơn giản).
 *
 * @typeParam TCursor - Kiểu cursor kỳ vọng sau decode
 * @param token - Chuỗi opaque từ query param (base64url)
 * @param validate - Type-guard tuỳ chọn kiểm shape sau parse
 * @returns Cursor value hợp lệ, hoặc `null` nếu token thiếu/hỏng/sai shape
 */
export function decodeCursor<TCursor>(
  token: string | undefined | null,
  validate?: (value: unknown) => value is TCursor,
): TCursor | null {
  if (!token) {
    return null;
  }

  try {
    const json = Buffer.from(fromBase64Url(token), "base64").toString("utf8");
    const parsed: unknown = JSON.parse(json);

    if (validate && !validate(parsed)) {
      return null;
    }

    return parsed as TCursor;
  } catch {
    // Token rác (không base64 / không JSON) → bỏ qua, về trang đầu.
    return null;
  }
}
