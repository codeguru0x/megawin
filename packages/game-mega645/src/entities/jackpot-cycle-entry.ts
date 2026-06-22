/**
 * Mega 6/45 – Jackpot Cycle Entry Entity (Ledger kỳ quay trong cycle)
 *
 * Mỗi document đại diện cho 1 kỳ quay đã settle trong 1 jackpot cycle.
 * Đây là **Cycle Ledger** — lưu lịch sử tích luỹ per-draw bất biến (immutable
 * sau khi settle), làm single source of truth cho opening/closing từng kỳ.
 *
 * ── Tại sao cần Cycle Ledger? ──────────────────────────────────────────────
 * `JackpotCycleDoc` chỉ lưu **current state** (currentAmount, drawCount). Lịch
 * sử opening/closing từng kỳ bị mất sau khi cộng dồn. Khi resettle kỳ cũ,
 * `PrepareSettle` không thể biết opening jackpot tại thời điểm kỳ đó settle
 * ban đầu → không thể tính đúng pool cho Jackpot winners.
 *
 * Ledger giải quyết bằng cách lưu từng kỳ 1 entry bất biến với đầy đủ
 * opening/contribution/closing/winner flag.
 *
 * ── Khác biệt vs Power 6/55 (single jackpot) ───────────────────────────────
 * Mega 6/45 CHỈ có 1 Jackpot (6/6), KHÔNG bonus, KHÔNG overflow, KHÔNG JP2.
 * → Ledger CHỈ cần `openingJp`, `jpContribution`, `closingJp`, `hasJpWinner`.
 * → Jackpot winner LUÔN đóng cycle (không có reset-only như JP2 của Power).
 *
 * ── Dùng khi nào? ───────────────────────────────────────────────────────────
 * 1. **Resettle**: `PrepareSettle` đọc `ledger(T).openingJp` để tái tính pool
 *    chính xác, thay vì đọc `activeCycle.currentAmount`.
 * 2. **DBA restore (B2)**: DBA đọc `ledger(T).openingJp` + `seq-1` để restore
 *    cycle về trạng thái trước kỳ T — không cần tính tay.
 * 3. **Audit/đối soát Vietlott**: view lịch sử tích luỹ từng kỳ.
 *
 * ── Quy ước `seq` ───────────────────────────────────────────────────────────
 * `seq` = số thứ tự kỳ trong cycle, 1-based = drawCount SAU khi settle kỳ này.
 * - `opening(T) === closing(T-1)` (tích luỹ tuần tự).
 * - `cycleDrawCountBefore` (dùng cho FinalizeSettle) = `ledger(T).seq - 1`.
 * - Kỳ đầu cycle: `seq = 1`, `openingJp = seedAmount`, không cần fallback.
 *
 * ── Ghi chú quan trọng ───────────────────────────────────────────────────────
 * - KHÔNG backfill kỳ cũ — ledger chỉ ghi từ kỳ settle TỪ NAY về sau.
 * - Upsert theo `{ cycleNo, drawId }` (idempotent) — FinalizeSettle gọi mỗi settle.
 * - Collection: mega645_jackpot_cycle_entries.
 */

/**
 * MongoDB document cho 1 kỳ quay trong Cycle Ledger Mega 6/45.
 * Immutable sau khi FinalizeSettle upsert — là nguồn sự thật lịch sử.
 * Collection: mega645_jackpot_cycle_entries.
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
   * Số thứ tự kỳ trong ngày (1 cho Mega 6/45).
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
   * Giá trị Jackpot đầu kỳ (trước khi cộng tích luỹ kỳ này) (VND).
   * = `closing(T-1).closingJp` nếu không phải kỳ đầu cycle.
   * = `JackpotCycleDoc.seedAmount` nếu là kỳ đầu cycle (seq = 1).
   *
   * Đây là trường **quan trọng nhất** cho resettle: `PrepareSettle` đọc field
   * này thay vì `activeCycle.currentAmount` khi resettle.
   */
  openingJp: number;

  /**
   * Phần tích luỹ cộng vào Jackpot kỳ này (VND).
   * = `DrawFinancial.jackpotContribution` sau settle.
   * = 0 nếu có Jackpot winner (winner nhận toàn bộ pool, cycle mới bắt đầu từ seed).
   */
  jpContribution: number;

  /**
   * Giá trị Jackpot cuối kỳ = openingJp + jpContribution (VND).
   * Nếu có Jackpot winner: = tổng pool đã trao cho winners.
   *   Cycle kết thúc sau kỳ này — opening kỳ tiếp thuộc cycle MỚI (= seedAmount).
   * Nếu roll-over: = opening + contribution = opening kỳ tiếp.
   * Snapshot từ `DrawJackpotSnapshot.closingAmount` sau settle.
   */
  closingJp: number;

  /**
   * Có người trúng Jackpot (6/6 số) trong kỳ này không.
   * Nếu true: cycle ĐÓNG sau kỳ này, cycle mới bắt đầu kỳ tiếp (single jackpot).
   * `detect-boundaries` đọc field này (trên ledger entry kỳ T) để xác định
   * trạng thái winner CŨ khi phân loại scenario resettle.
   */
  hasJpWinner: boolean;

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
