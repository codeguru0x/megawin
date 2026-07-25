/**
 * Shape của một entity sau khi đã đi qua JSON wire (API response) — mọi `Date`
 * trở thành `string` (ISO 8601), đệ quy qua array và nested object.
 *
 * Dùng cho response type của API route: domain entity dùng `Date` cho field thời
 * gian, nhưng response HTTP luôn serialize qua `JSON.stringify` trước khi tới
 * client — runtime luôn là ISO string, không bao giờ là `Date` object thật.
 * Khai báo response type = `WireType<Entity>` để FE nhận đúng type `string`,
 * không cần cast `as unknown as string` ở nơi tiêu thụ.
 *
 * ## Contract — chỉ xử lý `Date`, có chủ đích
 *
 * `WireType<T>` CỐ TÌNH chỉ map `Date → string`. Input của nó PHẢI là **Entity đã
 * normalize**: chỉ chứa plain type (string/number/boolean) + `Date`. Mọi BSON type
 * (`ObjectId`, `Long`, `Decimal128`, `Binary`) phải được convert thành plain type
 * ngay tại **repo mapper** (tầng Doc → Entity), KHÔNG để lọt tới đây. Ví dụ đã có
 * trong codebase: `_id: ObjectId → id: string`, `version: Long → string`
 * (`Long.toString()`).
 *
 * Lý do không nhồi BSON type vào đây:
 * - `@megawin/shared` là package generic, không được phụ thuộc `mongodb`.
 * - `JSON.stringify` các BSON type KHÔNG cho ra plain value: `Decimal128` →
 *   `{ "$numberDecimal": "..." }`. Nếu type khai `number` mà runtime ra Extended
 *   JSON → lại là "type nói dối". Quyết định "Decimal128 → number hay string" là
 *   nghiệp vụ, thuộc về mapper (nơi có ngữ cảnh), không phải type generic này.
 *
 * @example
 * ```ts
 * interface DrawEntity { drawTime: Date; result?: { publishedAt: Date } }
 *
 * // response HTTP thực tế: { drawTime: string; result?: { publishedAt: string } }
 * export interface GetDrawDetailOutput {
 *   draw: WireType<DrawEntity>;
 * }
 * ```
 *
 * @see {@link serializeDates} (`@megawin/shared/utils`) — hàm runtime chuyển
 * Date → string thật khớp type này, dùng ở nơi return để tránh cast `as unknown as`.
 */
export type WireType<T> = T extends Date
  ? string
  : T extends Array<infer U>
    ? Array<WireType<U>>
    : T extends object
      ? { [K in keyof T]: WireType<T[K]> }
      : T;
