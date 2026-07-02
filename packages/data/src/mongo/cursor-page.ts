/**
 * Kết quả phân trang cursor-based, dùng chung cho mọi repo cursor-paginate.
 *
 * Cursor-based paging tối ưu cho data lớn / time-series: không offset-scan như
 * `skip + limit`, mỗi trang seek thẳng tới vị trí cursor qua index.
 *
 * `TCursor` để mỗi loại paging tự định kiểu cursor, vì codebase tồn tại hai họ:
 * - **Scalar** — cursor là một giá trị đơn (id hex, `lineIndex`, `drawId`).
 *   Dùng mặc định `CursorPage<T>` (`TCursor = string`) hoặc `CursorPage<T, number>`.
 * - **Compound** — sort đa khoá để tie-break ổn định (`{ ts, _id }`,
 *   `{ createdAt, _id }`). Dùng `CursorPage<T, { ts: string; id: string }>`.
 *
 * `nextCursor` luôn ở dạng **đã serialize** (string / number / plain object) —
 * truyền thẳng qua HTTP/JSON và `getNextPageParam` của react-query không cần
 * transform. `null` nghĩa là đã hết trang.
 *
 * @typeParam TData - Kiểu phần tử trong trang (thường là Entity sau mapper).
 * @typeParam TCursor - Kiểu con trỏ trang kế. Mặc định `string`.
 *
 * @example Scalar cursor (id hex)
 * ```ts
 * type TicketPage = CursorPage<KenoTicketSummary>;
 * // { data: KenoTicketSummary[]; nextCursor: string | null }
 * ```
 *
 * @example Compound cursor (sort đa khoá)
 * ```ts
 * type AuditLogPage = CursorPage<AuditLogEntity, { ts: string; id: string }>;
 * // { data: AuditLogEntity[]; nextCursor: { ts: string; id: string } | null }
 * ```
 */
export interface CursorPage<TData, TCursor = string> {
  /** Records của trang hiện tại — đã slice về đúng `limit`. */
  data: TData[];
  /** Con trỏ trang kế. `null` nếu đã hết. */
  nextCursor: TCursor | null;
}
