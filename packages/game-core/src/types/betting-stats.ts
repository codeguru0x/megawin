/**
 * Game Core – Betting Stats Types (dùng chung cho tất cả game)
 *
 * Base types cho hệ thống vận hành alert-driven: worker cập nhật stats/alert
 * async, backoffice đọc pre-aggregated. Field ĐẶC THÙ game (byPlayType,
 * numberFreq, exposure, union alert type…) do game extend/khai riêng.
 * Xem `.cursor/analysis/keno-operations-risk-control.analysis.md` §8.
 */

/**
 * Tổng hợp số liệu cược 1 kỳ — phần chung mọi game.
 *
 * Field riêng game (`byPlayType`, `numberFreq`, `exposure`…) do game `extends`
 * thêm vào doc của mình — KHÔNG generic hoá ở đây (KISS, analysis §8).
 */
export interface DrawBettingTotals {
  /** Tổng doanh thu bán vé trong kỳ (VND). Công thức: Σ(entry.amount). */
  revenue: number;
  /** Tổng số entry (vé × kỳ) đã cộng vào stats. */
  entries: number;
  /**
   * Tổng số **bộ cược** trong kỳ: `Σ(board.betCount)` trên mọi entry — bằng `Σ entry.betUnitCount`.
   *
   * KHÔNG phải số board. 1 board `betCount = 5` đóng góp **5** vào đây nhưng chỉ 1 vào
   * `entry.selectionCount`. Tên cũ `boards` (đổi 02/08/2026) gây hiểu sai vì trùng tên mảng
   * `entrySummary.boards[]` mà `length` của nó chính là `selectionCount` — đại lượng KHÁC.
   * `sets` khớp `combo.sets`/`capSets` và label UI "Số bộ".
   */
  sets: number;
  /** Tổng hoa hồng đại lý (VND) — snapshot lúc place-bet. */
  commission: number;
  /** Số entry có amount vượt ngưỡng cược lớn (`ops.alerts.largeBetAmount`). */
  largeBetCount: number;
}

/**
 * Doc tích luỹ counter bằng `$inc` — tự mang watermark để **idempotent**.
 *
 * ## Vấn đề: `$inc` không idempotent, và không có nguyên tử cross-collection
 *
 * Worker stats ghi nhiều collection trong 1 batch (stats doc + combo + account). Mongo
 * KHÔNG cho nguyên tử qua nhiều collection (trừ transaction). Nên crash giữa 2 lệnh ghi:
 * - Nếu cursor đọc đã tiến trước → delta của collection sau **mất vĩnh viễn**.
 * - Nếu đọc lại batch → collection đã ghi bị **cộng đôi**.
 *
 * Không có thứ tự ghi nào an toàn. Đảo thứ tự chỉ đổi loại lỗi.
 *
 * ## Cách chặn: watermark THEO TỪNG DOCUMENT + update có điều kiện
 *
 * Mỗi doc tích luỹ tự nhớ nó đã cộng tới entry nào. Update luôn có dạng:
 *
 * ```ts
 * updateOne(
 *   { ...key, lastEntryId: { $lt: batchMaxId } },        // batch đã áp → KHÔNG khớp
 *   { $inc: { ...delta }, $set: { lastEntryId: batchMaxId } },  // cùng 1 lệnh, cùng 1 doc
 *   { upsert: true },
 * )
 * ```
 *
 * `$inc` và `$set lastEntryId` nằm trong **cùng một lệnh trên cùng một document** → nguyên
 * tử. Batch đã áp rồi thì filter không khớp → no-op. Nhờ vậy hệ thống **tự hội tụ sau mọi
 * crash**: tick sau đọc lại batch, doc nào chưa áp thì áp, doc nào áp rồi thì bỏ qua. Không
 * cần transaction, không cần recompute, không cần sửa tay.
 *
 * ## Cạm bẫy khi implement (ĐỌC TRƯỚC KHI SỬA)
 *
 * `upsert: true` + filter chứa `lastEntryId: {$lt}`: khi doc đã tồn tại VÀ đã áp batch,
 * filter không khớp → Mongo cố **insert doc mới** → lỗi duplicate key (11000) trên unique
 * index. Đây là hành vi ĐÚNG NHƯ THIẾT KẾ, nghĩa là "đã áp rồi". Phải `bulkWrite` với
 * `{ ordered: false }` và **coi 11000 là no-op**. Đừng "sửa" bằng cách bỏ điều kiện
 * `lastEntryId` — làm vậy là bỏ luôn tính idempotent.
 *
 * Xem `.cursor/plans/keno-ops-risk-control/p2-01-stats-worker-scale-hardening.plan.md` §3.5.
 */
export interface DeltaAccumulatedDoc {
  /**
   * ObjectId (hex string) của entry lớn nhất đã cộng vào các counter của **doc này**.
   *
   * Hex string cố định 24 ký tự → so sánh lexicographic trùng thứ tự ObjectId, `$lt` dùng
   * được trực tiếp. Doc mới (chưa từng áp batch nào) không có field này → filter `$lt` vẫn
   * khớp vì Mongo coi field thiếu là `null` và `null < string`.
   */
  lastEntryId: string;
}

/** Phân bố cược theo 1 đại lý trong kỳ (giá trị của `byTenant` map). */
export interface TenantBettingStat {
  /** Tổng tiền cược từ tenant này (VND). */
  amount: number;
  /** Số entry từ tenant này. */
  entries: number;
  /** Hoa hồng đại lý tích luỹ (VND). */
  commission: number;
}

/**
 * 1 dòng trong bảng "account cược tập trung nhất" của 1 kỳ.
 *
 * Shape đọc/hiển thị — KHÔNG ràng buộc nguồn. Keno derive từ collection
 * `keno_draw_account_stats` lúc đọc snapshot; 3 game còn lại tạm lấy từ mảng
 * `topAccounts` trong stats doc của mình (xem JSDoc field đó — sẽ bỏ theo p2-01).
 */
export interface TopAccountStat {
  /** ID account — link tới hồ sơ tài khoản khi cần. */
  accountId: string;
  /**
   * Username hiển thị (snapshot lúc cược) — cùng tên field với `TicketEntryDoc.username`
   * (entry/ticket) để tránh 2 tên khác nhau cho cùng 1 khái niệm. Ưu tiên hiển thị trước
   * `accountId`. Rỗng `""` khi entry không có username snapshot (hiếm) — UI fallback về `accountId`.
   */
  username: string;
  /** Tổng tiền cược của account trong kỳ (VND). */
  amount: number;
  /** Số entry của account trong kỳ. */
  entries: number;
}

/**
 * Khung thống kê realtime 1 kỳ quay — base chung mọi game.
 *
 * Game extend thêm field đặc thù: `interface KenoDrawBettingStatsDoc extends
 * DrawBettingStatsBase { _id: unknown; byPlayType: ...; numberFreq: ...; exposure: ... }`.
 * Worker cập nhật async theo watermark `lastEntryId` (analysis §3.3).
 *
 * ## KHÔNG có `topAccounts` ở base (dời xuống game 02/08/2026)
 *
 * Mảng top-K theo metric **TÍCH LUỸ** không seed lại được chính xác: phần tử rơi khỏi
 * top-K mất lịch sử → drift tỷ lệ thuận số người chơi. Cách đúng là collection phụ
 * `{drawId, accountId}` cộng bằng `$inc` rồi `sort({amount:-1}).limit(K)` lúc đọc —
 * Keno đã làm (`keno_draw_account_stats`).
 *
 * Field từng nằm ở đây và được `@deprecated`, nhưng để ở base thì game MỚI `extends`
 * vào là **tự động thừa hưởng kiến trúc sai**. Nên đã dời xuống 3 game chưa port
 * (bingo18/max3d/max3dpro) tự khai, và sẽ biến mất khi từng game port theo p2-01 §3.5.
 * KHÔNG thêm lại vào base.
 */
export interface DrawBettingStatsBase {
  /** drawId dạng `YYYY-MM-DD.NNN`. Unique key của doc. */
  drawId: string;
  /** Thời điểm worker cập nhật gần nhất — dùng làm ETag cho snapshot endpoint. */
  updatedAt: Date;
  /**
   * ObjectId entry lớn nhất đã cộng — cursor đọc insert-stream (crash-safe).
   *
   * Game áp per-doc watermark idempotent nên siết type về `string`: xem
   * {@link DeltaAccumulatedDoc}.
   */
  lastEntryId: unknown;
  /**
   * true khi kỳ đã ở trạng thái **TERMINAL** (`Settled` | `Void`) → worker ngừng quét doc này.
   *
   * ## KHÔNG đóng dấu ở `SalesClosed`
   *
   * `SalesClosed` là trạng thái **tạm**: kỳ có thể mở bán lại (`SalesClosed → SalesOpen`).
   * Đóng dấu `final` ở đây thì phần cược sau khi mở lại **không bao giờ được cộng**. Chỉ
   * `Settled`/`Void` mới bảo đảm không còn entry mới.
   *
   * Đây cũng là field lọc hàng đợi worker (`find({ final: false })`) → PHẢI có index,
   * nếu không mỗi tick là 1 collection scan.
   */
  final: boolean;
  /** Tổng hợp toàn kỳ. */
  totals: DrawBettingTotals;
  /** Phân bố theo đại lý — số tenant nhỏ nên Record không phình. Key = tenantId. */
  byTenant: Record<string, TenantBettingStat>;
}

/**
 * Cấu hình nhịp worker + top-K — phần LÕI chung mọi game (không field thừa).
 *
 * Game KHÔNG có khái niệm combo (vd Bingo 18 — 38 bucket đóng, không cần topCombosK)
 * dùng thẳng base này; game có combo space lớn (Keno, Max3D…) dùng {@link OpsStatsConfig}.
 * Ngưỡng alert (largeBetAmount, comboSetsWarn…) đặc thù game → game tự khai trong
 * `OpsConfig` của mình, KHÔNG có base ở đây (tránh base rỗng nghĩa — analysis §8).
 */
export interface OpsStatsConfigBase {
  /** Nhịp cập nhật stats doc trong worker (giây) — cũng là nhịp FE poll. Zod: int 5–60. */
  tickSeconds: number;
  /** Số entry giữ trong `topPotential` (vé nguy hiểm nhất theo potentialWin). Zod: int 20–100. */
  topPotentialK: number;
  /** Số account giữ trong `topAccounts` (concentration theo người chơi). Zod: int 20–100. */
  topAccountsK: number;
}

/**
 * Bản ĐẦY ĐỦ cho game có combo space lớn (Keno, Max3D/Pro…) — thêm `topCombosK`.
 *
 * Tách khỏi base 30/07/2026 (quyết định Bingo18 §7 Q3: "không cấu hình thừa default")
 * — Keno giữ nguyên import `OpsStatsConfig`, shape không đổi.
 */
export interface OpsStatsConfig extends OpsStatsConfigBase {
  /** Số combo giữ trong `topCombos`. Danh sách điều tra syndicate chính. Zod: int 20–200. */
  topCombosK: number;
}
