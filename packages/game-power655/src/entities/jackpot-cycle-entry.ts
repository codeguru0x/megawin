/**
 * Power 6/55 – Jackpot Cycle Entry Entity (Ledger kỳ quay trong cycle)
 *
 * Mỗi document đại diện cho 1 kỳ quay đã settle trong 1 jackpot cycle.
 * Đây là **Cycle Ledger** — lưu lịch sử tích luỹ per-draw bất biến (immutable
 * sau khi settle) thay cho `preSettleCycleSnapshot` từng đề xuất trên DrawDoc.
 *
 * ── Tại sao cần Cycle Ledger? ──────────────────────────────────────────────
 * `JackpotCycleDoc` chỉ lưu **current state** (jackpot1/2CurrentAmount,
 * drawCount). Lịch sử opening/closing từng kỳ bị mất sau khi cộng dồn.
 * Khi resettle kỳ cũ, `PrepareSettle` không thể biết opening jackpot tại
 * thời điểm kỳ đó settle ban đầu → không thể tính đúng pool cho JP winners.
 *
 * Ledger giải quyết bằng cách lưu từng kỳ 1 entry bất biến với đầy đủ
 * opening/contribution/closing/winner flags.
 *
 * ── Dùng khi nào? ───────────────────────────────────────────────────────────
 * 1. **Resettle**: `PrepareSettle` đọc `ledger(T).openingJp1/2` để tái tính
 *    pool chính xác, thay vì đọc `activeCycle.jackpot*CurrentAmount`.
 * 2. **DBA restore (B2)**: DBA đọc `ledger(T).openingJp1/2` + `seq-1` để
 *    restore cycle về trạng thái trước kỳ T — không cần tính tay.
 * 3. **Audit/đối soát Vietlott**: view lịch sử tích luỹ từng kỳ.
 *
 * ── Quy ước `seq` ───────────────────────────────────────────────────────────
 * `seq` = số thứ tự kỳ trong cycle, 1-based = drawCount SAU khi settle kỳ này.
 * - `opening(T) === closing(T-1)` (tích luỹ tuần tự).
 * - `cycleDrawCountBefore` (dùng cho FinalizeSettle) = `ledger(T).seq - 1`.
 * - Kỳ đầu cycle: `seq = 1`, `openingJp1/2 = seedAmount`, không cần fallback.
 *
 * ── Ghi chú quan trọng ───────────────────────────────────────────────────────
 * - KHÔNG backfill kỳ cũ — ledger chỉ ghi từ kỳ settle TỪ NAY về sau.
 * - Upsert theo `{ cycleNo, drawId }` (idempotent) — FinalizeSettle gọi mỗi settle.
 * - Collection: power655JackpotCycleEntries.
 */

/**
 * MongoDB document cho 1 kỳ quay trong Cycle Ledger Power 6/55.
 * Immutable sau khi FinalizeSettle upsert — là nguồn sự thật lịch sử.
 * Collection: power655JackpotCycleEntries.
 */
export interface JackpotCycleEntryDoc {
  /** MongoDB ObjectId – khóa chính nội bộ. Không dùng trong business logic. */
  _id: unknown;

  /**
   * Số thứ tự cycle. Liên kết với `JackpotCycleDoc.cycleNo`.
   * Compound index: `{ cycleNo, seq }` unique + `{ drawId }` unique.
   */
  cycleNo: number;

  /** Mã kỳ quay. Format: `YYYY-MM-DD.NNN`. Join key với DrawDoc. */
  drawId: string;

  /**
   * Số thứ tự kỳ trong ngày (1 cho Power 6/55).
   * Snapshot từ DrawDoc.drawNo để tiện lọc/sort mà không cần join.
   */
  drawNo: number;

  /**
   * Số thứ tự kỳ trong cycle (1-based).
   * = `drawCount` của `JackpotCycleDoc` SAU KHI settle kỳ này.
   * = `ledger(T-1).seq + 1` (kỳ đầu = 1).
   *
   * Dùng để:
   *   - Tính `cycleDrawCountBefore` khi resettle: `seq - 1`.
   *   - Sort chronological trong cycle: `{ cycleNo, seq }`.
   *   - `findLatestInCycle`: cấp `nextSeq` khi FinalizeSettle.
   */
  seq: number;

  /**
   * Giá trị JP1 đầu kỳ (trước khi cộng tích luỹ kỳ này) (VND).
   * = `closing(T-1).closingJp1` nếu không phải kỳ đầu cycle.
   * = `JackpotCycleDoc.jackpot1SeedAmount` nếu là kỳ đầu cycle (seq = 1).
   *
   * Đây là trường **quan trọng nhất** cho resettle: `PrepareSettle` đọc
   * field này thay vì `activeCycle.jackpot1CurrentAmount` khi resettle.
   */
  openingJp1: number;

  /**
   * Giá trị JP2 đầu kỳ (trước khi cộng tích luỹ kỳ này) (VND).
   * = `closing(T-1).closingJp2` nếu không phải kỳ đầu cycle.
   * = `JackpotCycleDoc.jackpot2SeedAmount` nếu là kỳ đầu cycle (seq = 1).
   * Nếu kỳ T-1 có JP2 winner: closingJp2 của T-1 = seedAmount (sau reset).
   */
  openingJp2: number;

  /**
   * Phần tích luỹ cộng vào JP1 kỳ này (VND).
   * = `DrawFinancial.jackpot1Contribution` sau settle.
   * Đã trừ `jp1Overflow` nếu overflow kích hoạt kỳ này.
   * = 0 nếu có JP1 winner (winner nhận toàn bộ pool, JP1 reset về seed cycle mới).
   */
  jp1Contribution: number;

  /**
   * Phần tích luỹ cộng vào JP2 kỳ này (VND).
   * = `DrawFinancial.jackpot2Contribution` sau settle.
   * Có thể bao gồm `jp1Overflow` nếu overflow kích hoạt VÀ có JP2 winner.
   */
  jp2Contribution: number;

  /**
   * Lượng tiền vượt ngưỡng JP1 (VND) kỳ này.
   * = `DrawFinancial.jp1Overflow`. = 0 nếu overflow không kích hoạt.
   * Chỉ > 0 khi: !hasJp1Winner && hasJp2Winner && (openingJp1 + jp1Contribution) > threshold.
   */
  jp1Overflow: number;

  /**
   * Giá trị JP1 cuối kỳ = openingJp1 + jp1Contribution (VND).
   * Nếu có JP1 winner: = tổng pool JP1 đã trao cho winners.
   *   Cycle kết thúc sau kỳ này — opening kỳ tiếp thuộc cycle MỚI.
   * Nếu roll-over: = opening + contribution = opening kỳ tiếp.
   * Snapshot từ `DrawJackpot.closingJackpot1` sau settle.
   */
  closingJp1: number;

  /**
   * Giá trị JP2 cuối kỳ = openingJp2 + jp2Contribution (VND).
   * Nếu có JP2 winner: = tổng pool JP2 đã trao (bao gồm overflow nếu có).
   *   `closingJp2` tại đây là pool trước reset; JP2 reset về seed sau kỳ này.
   *   `openingJp2` kỳ tiếp = seedAmount (sau reset).
   * Nếu roll-over: = opening + contribution = opening kỳ tiếp.
   */
  closingJp2: number;

  /**
   * Có người trúng JP1 (6/6 số chính) trong kỳ này không.
   * Nếu true: cycle sẽ đóng sau kỳ này, cycle mới bắt đầu kỳ tiếp.
   * `detect-boundaries`/`resolveOpening` đọc field này (per-jackpot) để xác định
   * trạng thái JP1 winner CŨ và quyết định opening cascade.
   */
  hasJp1Winner: boolean;

  /**
   * Có người trúng JP2 (5/6 + bonus) trong kỳ này không.
   * Nếu true: JP2 reset về seed, JP1 tiếp tục tích luỹ trong cycle.
   * `detect-boundaries`/`resolveOpening` đọc field này (per-jackpot) để xác định
   * trạng thái JP2 winner CŨ và quyết định opening cascade.
   */
  hasJp2Winner: boolean;

  /**
   * JP2 có bị reset trong kỳ này không (= hasJp2Winner).
   * Redundant với hasJp2Winner nhưng explicit hơn cho DBA restore.
   * Khi true: `openingJp2` kỳ tiếp = seedAmount (không phải closingJp2).
   * `resolveOpening` dựa winner flags để chọn seed vs closing khi cascade.
   */
  jp2DidReset: boolean;

  /** Thời điểm settle thành công (copy từ DrawDoc.settledAt). */
  settledAt: Date;

  /**
   * Thời điểm upsert/cập nhật ledger entry gần nhất.
   * Cập nhật mỗi khi FinalizeSettle upsert (initial settle hoặc resettle Type A).
   */
  updatedAt: Date;
}

/**
 * Application layer entity (thay _id bằng string id).
 * Dùng trong application layer thay cho JackpotCycleEntryDoc trực tiếp.
 */
export interface JackpotCycleEntryEntity extends Omit<JackpotCycleEntryDoc, "_id"> {
  /** ObjectId dạng hex string – khóa chính dùng trong application layer. */
  id: string;
}
