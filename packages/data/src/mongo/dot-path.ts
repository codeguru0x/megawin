import type { Binary, Decimal128, Long, ObjectId } from "mongodb";

/**
 * Typed dot-path cho MongoDB query — chống typo/lệch tên field khi query hoặc
 * update embedded document bằng dot notation.
 *
 * Vấn đề: `updateOne({ drawId }, { $set: { "financial.totalRevenue": x } })` —
 * string path KHÔNG được compiler kiểm tra. Đổi tên field trong entity Doc mà
 * quên sửa string trong repo → bug âm thầm (Mongo tự tạo field mới).
 *
 * Giải pháp: `DotPath<TDoc>` sinh union mọi dot-path hợp lệ từ entity Doc.
 * Kết hợp `docPath<TDoc>()` để validate path tại compile-time — rename field
 * trong Doc → mọi path sai lập tức đỏ.
 *
 * `docPath` nhận **cả 2 dạng**, khớp đúng cách Mongo viết ở mỗi vị trí:
 * - Update/filter key (KHÔNG `$`): `f("financial.totalRevenue")`
 * - Aggregate value ref (CÓ `$`): `f("$payout.payoutAmount")`
 *
 * @example
 * const f = docPath<LotteryDrawDoc>();
 * await this.updateOne(
 *   { drawId },
 *   {
 *     $set: {
 *       [f("financial.totalRevenue")]: revenue,   // OK — compiler check
 *       // [f("financial.totalRevenu")]: revenue, // ❌ compile error
 *     },
 *   },
 * );
 */

/** Leaf types — không đi sâu thêm khi sinh path (BSON scalar + wrapper types). */
type MongoLeaf =
  | string
  | number
  | boolean
  | bigint
  | Date
  | ObjectId
  | Long
  | Decimal128
  | Binary
  | null
  | undefined;

/** Đếm lùi depth để chặn đệ quy vô hạn trên type tự tham chiếu. */
type Prev = [never, 0, 1, 2, 3, 4, 5];

/**
 * Union mọi dot-path hợp lệ của `T` (tối đa `D` tầng lồng, mặc định 5).
 *
 * - Field scalar → chính tên field.
 * - Embedded doc → tên field + `field.subField...` (đệ quy).
 * - Array → tên field + path của element (Mongo dot notation không cần index
 *   khi match/multikey: `"entrySummary.boards.picks"`).
 * - `Record<string, V>` → `${string}` segment (dynamic key vẫn check được phần sub-path).
 */
export type DotPath<T, D extends number = 5> = [D] extends [never]
  ? never
  : T extends MongoLeaf
    ? never
    : T extends ReadonlyArray<infer U>
      ? DotPath<U, Prev[D]>
      : {
          [K in keyof T & string]: NonNullable<T[K]> extends MongoLeaf
            ? K
            : NonNullable<T[K]> extends ReadonlyArray<infer U>
              ? K | `${K}.${DotPath<U, Prev[D]>}`
              : K | `${K}.${DotPath<NonNullable<T[K]>, Prev[D]>}`;
        }[keyof T & string];

/**
 * Union mọi field-path hợp lệ của `TDoc` ở **cả 2 dạng** Mongo dùng:
 * - update/filter key (không `$`): `DotPath<TDoc>`
 * - aggregate value ref (có `$`): `` `$${DotPath<TDoc>}` ``
 *
 * `$` là ngữ pháp của chính Mongo (field ref bên value bắt buộc `$`; update key
 * cấm `$`) — helper chỉ validate phần path, `$` do người viết đặt đúng vị trí.
 */
export type FieldPath<T, D extends number = 5> = DotPath<T, D> | `$${DotPath<T, D>}`;

/**
 * Factory tạo path validator cho 1 entity Doc — dùng trong repo khi build
 * filter/update/aggregate có dot notation. Zero runtime cost (identity function).
 *
 * Nhận cả `"payout.x"` (update/filter key) lẫn `"$payout.x"` (aggregate value ref);
 * validate phần path theo `DotPath<TDoc>` — rename field trong Doc → mọi path sai đỏ.
 *
 * Khai báo 1 lần ở đầu file repo: `const f = docPath<TicketEntryDoc>();`
 *
 * @example
 * const f = docPath<LotteryTicketEntryDoc>();
 *
 * // update key — không $
 * await this.updateOne(
 *   { _id },
 *   { $set: { [f("payout.settledAt")]: now } },
 * );
 *
 * // aggregate value ref — có $
 * await this.aggregate([
 *   { $group: { _id: null, total: { $sum: f("$payout.payoutAmount") } } },
 * ]);
 */
export function docPath<TDoc>(): <P extends FieldPath<TDoc> & string>(path: P) => P {
  return (path) => path;
}
