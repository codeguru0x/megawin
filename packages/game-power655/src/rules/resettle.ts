/**
 * Power 6/55 – Resettle domain constants (ResettleScenario).
 *
 * Định nghĩa type-safe constants thay cho plaintext strings. Tránh typo khi
 * code điền sai text và đảm bảo autocomplete đúng trong TypeScript.
 *
 * ── Tóm tắt 3 scenario ────────────────────────────────────────────────────
 *
 * TYPE_A (Automatic):
 *   - Kết quả mới KHÔNG có JP1/JP2 winner (chính kỳ T) VÀ chain sau T cũng
 *     không có JP1/JP2 winner.
 *   - Hệ thống tự thực hiện toàn bộ: reversal payout cũ → reset entries →
 *     re-settle → update jackpot cycle tự động.
 *   - skipCycleUpdate = false → FinalizeSettle cập nhật cycle như bình thường.
 *
 * TYPE_B1 (Auto Payout + DBA Cycle):
 *   - Kết quả mới kỳ T CÓ JP1 hoặc JP2 winner MỚI (phát hiện qua pre-flight
 *     re-match) VÀ kỳ T là kỳ MỚI NHẤT trong cycle (chain rỗng).
 *   - Hệ thống tự động: reversal payout cũ → reset entries → re-settle.
 *   - Jackpot cycle: DBA can thiệp thủ công sau khi settle xong.
 *   - skipCycleUpdate = true → FinalizeSettle BỎ QUA bước update cycle.
 *
 * TYPE_B2 (Cascade step-wise — auto payout từng kỳ, DBA chốt cycle giữa bước):
 *   - Kỳ T CÓ JP1/JP2 winner MỚI VÀ có kỳ settle SAU T (theo thời gian), HOẶC kỳ T
 *     không có winner mới nhưng chain sau T chứa winner.
 *   - Tức là: resettle ảnh hưởng đến nhiều kỳ settle kế tiếp. Chain phát hiện theo
 *     `drawId` (thời gian) nên BẮC CẦU qua ranh giới cycle.
 *   - CASCADE: resettle tuần tự T→T+1→…→T+n, mỗi kỳ auto payout + skipCycleUpdate
 *     =true. DBA chốt/tái cấu trúc cycle (đóng/mở/gộp cycleNo) giữa mỗi bước dựa
 *     trên dữ liệu ledger. Bao gồm cả cross-cycle: gỡ JP1 winner ở kỳ đóng cycle
 *     khi cycle kế đã có kỳ kết sổ → các kỳ đó nằm trong chain, cùng được resettle
 *     tuần tự; DBA gộp cycle metadata giữa bước (can thiệp tối thiểu).
 *
 * ── Ledger guard ─────────────────────────────────────────────────────────
 *   Nếu `JackpotCycleEntryRepository.findByDraw(drawId) === null` (kỳ cũ
 *   trước khi ledger ra production, hoặc kỳ chưa settle lần đầu), hệ thống
 *   trả `LEDGER_MISSING` và yêu cầu DBA can thiệp thủ công.
 */

/**
 * Phân loại scenario resettle của Power 6/55.
 *
 * Dùng giá trị này (thay vì plaintext) xuyên suốt code để tránh typo.
 *
 * | Value | Ý nghĩa |
 * |---|---|
 * | `TYPE_A` | Auto hoàn toàn — không ảnh hưởng cycle structure. |
 * | `TYPE_B1` | Auto payout + DBA cycle — winner mới tại T, T là kỳ mới nhất. |
 * | `TYPE_B2` | Cascade step-wise XUYÊN CYCLE — chain kỳ đã kết sổ sau T (theo thời gian) bị ảnh hưởng. Auto payout từng kỳ, DBA chốt/tái cấu trúc cycle giữa các bước. Bao gồm gỡ JP1 winner ở kỳ đóng cycle. |
 * | `LEDGER_MISSING` | Ledger entry của kỳ T không tồn tại — DBA thủ công toàn bộ. |
 */
export const ResettleScenario = {
  /** Auto hoàn toàn: reversal + reset + re-settle + cycle update tự động. */
  TYPE_A: "TYPE_A",
  /** Auto payout: reversal + reset + re-settle; DBA update cycle thủ công sau. */
  TYPE_B1: "TYPE_B1",
  /**
   * Cascade step-wise XUYÊN CYCLE: chain kỳ đã kết sổ sau T (theo thời gian) bị ảnh
   * hưởng (số tiền thưởng đổi do pool tích luỹ khác; danh tính winner KHÔNG đổi vì
   * số quay các kỳ T+n giữ nguyên). Chain phát hiện theo `drawId` nên bắc cầu qua
   * ranh giới cycle — gỡ JP1 winner ở kỳ đóng cycle (cycle kế đã có kỳ kết sổ) cũng
   * vào đây. Worker auto payout + re-settle TỪNG kỳ (skipCycleUpdate=true); DBA
   * chốt/tái cấu trúc cycle (đóng/mở/gộp cycleNo) sau mỗi kỳ dựa trên ledger. Chạy
   * tuần tự T → T+1 → … → T+n (guard RESETTLE_CASCADE_ORDER).
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
