/**
 * Lotto 5/35 – Resettle domain constants (ResettleScenario).
 *
 * TYPE_A: auto hoàn toàn (không ảnh hưởng JP winner / split state, không có kỳ sau).
 * TYPE_B1: auto payout + DBA cycle (JP/split affected, T là kỳ settle cuối — chain rỗng).
 * TYPE_B2: cascade step-wise XUYÊN CYCLE (có kỳ settle sau T theo `drawId`). Worker
 *   auto payout từng kỳ (skipCycleUpdate=true), resettle tuần tự T→T+1→…→T+n; DBA
 *   chốt/tái cấu trúc cycle (đóng/mở/gộp cycleNo) giữa mỗi bước dựa trên ledger. Bao
 *   gồm gỡ JP winner HOẶC Split ở kỳ đóng cycle (cycle kế đã có kỳ kết sổ) → các kỳ
 *   đó nằm trong chain, cùng resettle tuần tự (can thiệp DBA tối thiểu ở cycle metadata).
 * LEDGER_MISSING: không có ledger entry — báo kỹ thuật.
 */

export const ResettleScenario = {
  TYPE_A: "TYPE_A",
  TYPE_B1: "TYPE_B1",
  /**
   * Cascade step-wise XUYÊN CYCLE: có kỳ settle sau T (theo `drawId`, bất kể cycleNo).
   * Số tiền thưởng/split các kỳ sau đổi do pool tích luỹ đổi (số quay không đổi). Worker
   * auto payout + re-settle TỪNG kỳ (skipCycleUpdate=true); DBA chốt/tái cấu trúc cycle
   * sau mỗi kỳ. Bao gồm gỡ JP winner HOẶC Split ở kỳ đóng cycle — các kỳ ở cycle kế nằm
   * trong chain. Chạy tuần tự T → T+1 → … → T+n (guard RESETTLE_CASCADE_ORDER).
   */
  TYPE_B2: "TYPE_B2",
  LEDGER_MISSING: "LEDGER_MISSING",
} as const;

export type ResettleScenario = (typeof ResettleScenario)[keyof typeof ResettleScenario];
