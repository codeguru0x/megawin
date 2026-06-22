/**
 * Mega 6/45 – Resettle domain constants (ResettleScenario).
 *
 * Định nghĩa type-safe constants thay cho plaintext strings. Tránh typo khi
 * code điền sai text và đảm bảo autocomplete đúng trong TypeScript.
 *
 * ── Đặc thù SINGLE jackpot ─────────────────────────────────────────────────
 * Mega 6/45 chỉ có 1 Jackpot (6/6). Jackpot winner LUÔN đóng cycle (không có
 * reset-only như JP2 của Power 6/55) → việc phân loại scenario CHỈ xét 1 chiều
 * winner (có/không), đơn giản hơn dual jackpot.
 *
 * ── Tóm tắt 3 scenario ────────────────────────────────────────────────────
 *
 * TYPE_A (Automatic):
 *   - Kết quả mới KHÔNG có Jackpot winner (chính kỳ T) VÀ chain sau T cũng
 *     không có Jackpot winner.
 *   - Hệ thống tự thực hiện toàn bộ: reversal payout cũ → reset entries →
 *     re-settle → update jackpot cycle tự động.
 *   - skipCycleUpdate = false → FinalizeSettle cập nhật cycle như bình thường.
 *
 * TYPE_B1 (Auto Payout + DBA Cycle):
 *   - Kết quả mới kỳ T CÓ Jackpot winner MỚI (phát hiện qua pre-flight re-match)
 *     HOẶC kỳ T trước đây CÓ winner (đảo chiều), VÀ kỳ T là kỳ MỚI NHẤT trong
 *     cycle (chain rỗng).
 *   - Hệ thống tự động: reversal payout cũ → reset entries → re-settle.
 *   - Jackpot cycle: DBA can thiệp thủ công sau khi settle xong.
 *   - skipCycleUpdate = true → FinalizeSettle BỎ QUA bước update cycle.
 *
 * TYPE_B2 (Cascade step-wise, kể cả XUYÊN CYCLE):
 *   - Kỳ T CÓ thay đổi winner (mới hoặc cũ) VÀ chain kỳ settle sau T không rỗng,
 *     HOẶC kỳ T không đổi winner nhưng chain sau T chứa winner.
 *   - Chain detect XUYÊN CYCLE (theo `drawId` thời gian) → bắt cả trường hợp gỡ
 *     winner ở kỳ đóng cycle khiến các kỳ ở cycle kế phải gộp ngược.
 *   - CASCADE STEP-WISE: worker resettle TUẦN TỰ từng kỳ T→T+1→…→T+n (mỗi kỳ chạy
 *     luồng B1: auto payout + skipCycleUpdate=true). DBA chốt/tái cấu trúc cycle
 *     metadata (gộp/đóng/mở cycleNo trong ledger + jackpot_cycles) GIỮA các bước,
 *     dựa trên dữ liệu ledger. Worker chỉ re-settle entries + payout, KHÔNG tự
 *     đổi cycleNo. Guard RESETTLE_CASCADE_ORDER ép đúng thứ tự.
 *
 * ── Ledger guard ─────────────────────────────────────────────────────────
 *   Nếu `JackpotCycleEntryRepository.findByDraw(drawId) === null` (kỳ cũ
 *   trước khi ledger ra production, hoặc kỳ chưa settle lần đầu), hệ thống
 *   trả `LEDGER_MISSING` và yêu cầu DBA can thiệp thủ công.
 */

/**
 * Phân loại scenario resettle của Mega 6/45.
 *
 * Dùng giá trị này (thay vì plaintext) xuyên suốt code để tránh typo.
 *
 * | Value | Ý nghĩa |
 * |---|---|
 * | `TYPE_A` | Auto hoàn toàn — không ảnh hưởng cycle structure. |
 * | `TYPE_B1` | Auto payout + DBA cycle — đổi winner tại T, T là kỳ mới nhất. |
 * | `TYPE_B2` | Cascade step-wise (kể cả xuyên cycle) — chain kỳ đã kết sổ sau T bị ảnh hưởng. Auto payout từng kỳ, DBA chốt/tái cấu trúc cycle giữa các bước. |
 * | `LEDGER_MISSING` | Ledger entry của kỳ T không tồn tại — DBA thủ công toàn bộ. |
 */
export const ResettleScenario = {
  /** Auto hoàn toàn: reversal + reset + re-settle + cycle update tự động. */
  TYPE_A: "TYPE_A",
  /** Auto payout: reversal + reset + re-settle; DBA update cycle thủ công sau. */
  TYPE_B1: "TYPE_B1",
  /**
   * Cascade step-wise (kể cả XUYÊN CYCLE): chain kỳ đã kết sổ sau T bị ảnh hưởng
   * (số tiền thưởng đổi do pool tích luỹ khác; danh tính winner KHÔNG đổi vì số quay
   * các kỳ T+n giữ nguyên). Chain detect theo `drawId` (thời gian) nên bắt cả kỳ ở
   * cycle kế khi gỡ winner đóng cycle. Worker auto payout + re-settle TỪNG kỳ
   * (skipCycleUpdate=true); DBA chốt/tái cấu trúc cycle (gộp/đóng/mở) sau mỗi kỳ
   * dựa trên ledger. Chạy tuần tự T → T+1 → … → T+n (guard RESETTLE_CASCADE_ORDER).
   */
  TYPE_B2: "TYPE_B2",
  /**
   * Ledger entry của kỳ T không tồn tại — kỳ settle trước khi ledger ra production.
   * Hệ thống không thể tính toán jackpot pool chính xác → DBA thủ công toàn bộ.
   */
  LEDGER_MISSING: "LEDGER_MISSING",
} as const;

/** Union type của tất cả giá trị `ResettleScenario`. */
export type ResettleScenario = (typeof ResettleScenario)[keyof typeof ResettleScenario];
