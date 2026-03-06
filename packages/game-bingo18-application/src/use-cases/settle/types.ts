/**
 * Bingo 18 Settle – Shared Types
 *
 * ═══════════════════════════════════════════════════════════════════════
 * SINGLE SOURCE OF TRUTH cho toàn bộ settle pipeline.
 * ═══════════════════════════════════════════════════════════════════════
 *
 * `SettleContext` là context duy nhất xuyên suốt settle flow, được enrich
 * dần qua các step. Step Function chỉ dùng 1 biến `$settleCtx`:
 *
 *   PrepareSettle → output = SettleContext (chưa có financials)
 *   SettleEntries → nhận SettleContext, trả done/false (loop)
 *   CalculateFinancials → nhận SettleContext, trả SettleFinancials
 *     → Step Function merge: settleCtx.financials = result
 *   SyncTicketSummaries → nhận SettleContext
 *   BuildReport → nhận SettleContext (financials có)
 *   FinalizeSettle → nhận SettleContextWithFinancials (financials bắt buộc)
 *   DispatchPayouts → nhận { drawId } (package riêng)
 *
 * Mỗi step destructure những field cần dùng. Không define input riêng
 * (trừ PrepareSettleInput vì step đầu chỉ nhận drawId).
 */

import type {
  SingleNumPrizes,
  DoubleMatchPrizes,
  TripleMatchPrizes,
  SumTotalPrizes,
  BigSmallDrawPrizes,
} from "@megawin/game-bingo18/entities";

// ─────────────────────────────────────────────────────────────────────────────
// Primitive shared types
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kết quả quay Bingo 18 — 3 viên xúc xắc (1-6) và tổng.
 *
 * Dùng bởi SettleEntries để match boards + side bets vs kết quả quay.
 */
export interface BingoDrawResult {
  /** 3 số kết quả (1-6), mỗi số đại diện 1 viên xúc xắc. */
  numbers: number[];
  /** Tổng 3 số = numbers[0] + numbers[1] + numbers[2]. Dùng cho SumTotal + BigSmallDraw. */
  sum: number;
}

/**
 * Config settle — snapshot từ GlobalConfig tại thời điểm PrepareSettle.
 *
 * Chứa tỷ lệ tài chính + bảng giải thưởng cho tất cả loại cược.
 * Config KHÔNG thay đổi giữa các step — snapshot tại thời điểm settle.
 */
export interface BingoSettleConfig {
  /** Tỷ lệ công ty thu về trên tổng doanh thu (0-1, mặc định 0.15 = 15%). */
  companyRate: number;
  /** Tỷ lệ hoa hồng đại lý mặc định (0-1), override per tenant qua TenantConfig. */
  defaultCommissionRate: number;
  /** Bảng giải thưởng cược Số Đơn — match 1/2/3 số. */
  singleNumPrizes: SingleNumPrizes;
  /** Bảng giải thưởng cược Số Đôi — match ≥2 số giống nhau. */
  doubleMatchPrizes: DoubleMatchPrizes;
  /** Bảng giải thưởng cược Bộ Ba — specific/any triple. */
  tripleMatchPrizes: TripleMatchPrizes;
  /** Bảng giải thưởng cược Tổng — match tổng chính xác. */
  sumTotalPrizes: SumTotalPrizes;
  /** Bảng giải thưởng cược Tài/Xỉu/Hoà — big/small/draw. */
  bigSmallDrawPrizes: BigSmallDrawPrizes;
}

// ─────────────────────────────────────────────────────────────────────────────
// SettleFinancials – output CalculateFinancials, nested vào SettleContext
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Kết quả tính toán tài chính kỳ quay — output của CalculateFinancials.
 *
 * Sau khi CalculateFinancials hoàn thành, Step Function merge kết quả này
 * vào `settleCtx.financials`. Các step sau truy cập qua `ctx.financials`.
 *
 * Bingo 18 KHÔNG có Jackpot — tài chính đơn giản hơn Lotto 5/35.
 * Tất cả giá trị tiền tệ đều ở đơn vị VND, số nguyên (không thập phân).
 */
export interface SettleFinancials {
  /** Tổng doanh thu kỳ quay (VND) = tổng tiền cược của tất cả entries. */
  totalRevenue: number;
  /** Tổng giải thưởng đã trả (VND) — tổng payout tất cả loại cược. */
  totalPrizes: number;
  /** Tổng hoa hồng đại lý (VND) — commission đã cam kết trả cho tenant/agent. */
  totalAgentCommission: number;
  /** Phần công ty thu về (VND) = companyRate × totalRevenue. */
  companyTake: number;
  /** Chi tiết tài chính theo từng tenant — dùng cho báo cáo. */
  tenantBreakdown: Array<{
    /** Mã tenant. */
    tenantId: string;
    /** Doanh thu từ tenant (VND). */
    revenue: number;
    /** Hoa hồng đại lý (VND). */
    commission: number;
    /** Tỷ lệ hoa hồng (0-1). */
    commissionRate: number;
    /** Số entries của tenant trong kỳ. */
    entryCount: number;
  }>;
}

// ─────────────────────────────────────────────────────────────────────────────
// SettleContext – single context xuyên suốt settle pipeline
// ─────────────────────────────────────────────────────────────────────────────

/**
 * Context duy nhất xuyên suốt settle pipeline — progressively enriched.
 *
 * PrepareSettle tạo context ban đầu (không có `financials`).
 * Sau CalculateFinancials, Step Function merge `financials` vào context.
 * Từ đó tất cả step sau đều nhận SettleContext ĐÃ CÓ `financials`.
 *
 * Step Function chỉ dùng 1 biến `$settleCtx` — không cần `$financials` riêng.
 *
 * ┌──────────────────────────────────────────────────────────────────┐
 * │ PrepareSettle         → SettleContext (financials = undefined)   │
 * │ SettleEntries         ← SettleContext (loop, match & payout)    │
 * │ CalculateFinancials   ← SettleContext → SettleFinancials        │
 * │   ↳ SFN merge: settleCtx.financials = result                   │
 * │ SyncTicketSummaries   ← SettleContext (loop, recompute tickets) │
 * │ BuildReport           ← SettleContext (financials có)           │
 * │ FinalizeSettle        ← SettleContextWithFinancials (bắt buộc) │
 * │ DispatchPayouts       ← { drawId } (package riêng)             │
 * └──────────────────────────────────────────────────────────────────┘
 */
export interface SettleContext {
  /**
   * Mã kỳ quay duy nhất — primary key xuyên suốt settle flow.
   * Tất cả step dùng drawId để query entries, draw document.
   */
  drawId: string;

  /**
   * Ngày quay (YYYY-MM-DD) — ngày diễn ra kỳ quay.
   * Dùng để group các kỳ quay trong cùng ngày.
   */
  drawDate: string;

  /**
   * Số thứ tự kỳ quay trong ngày.
   * Bingo 18 có nhiều kỳ/ngày (cách nhau 5 phút).
   */
  drawNo: number;

  /**
   * Ngày tài chính (YYYY-MM-DD) — dùng làm key phân nhóm báo cáo.
   * Có thể khác drawDate khi kỳ quay đêm khuya thuộc ngày tài chính hôm sau.
   * BuildReport dùng field này để upsert báo cáo hàng ngày.
   */
  financialDate: string;

  /**
   * Kết quả quay đã publish — 3 viên xúc xắc + tổng.
   * SettleEntries dùng để match boards + side bets vs kết quả.
   */
  result: BingoDrawResult;

  /**
   * Cấu hình giải thưởng & tỷ lệ tài chính tại thời điểm settle.
   * Snapshot từ GlobalConfig — KHÔNG thay đổi giữa các step.
   */
  config: BingoSettleConfig;

  /**
   * Tổng entries cần settle trong kỳ này.
   * Dùng cho logging/monitoring, không ảnh hưởng logic settle.
   */
  totalEntries: number;

  /**
   * Dữ liệu tài chính tổng hợp — output của CalculateFinancials.
   *
   * undefined TRƯỚC khi CalculateFinancials chạy.
   * Sau CalculateFinancials, Step Function merge kết quả vào đây.
   * Các step sau (BuildReport, FinalizeSettle) truy cập qua field này.
   */
  financials?: SettleFinancials;
}

/**
 * SettleContext với financials BẮT BUỘC — dùng cho các step SAU CalculateFinancials
 * mà CẦN financials để hoạt động (FinalizeSettle).
 *
 * Tại runtime, Step Function đảm bảo financials đã được merge trước khi
 * gọi các step này. Type này cung cấp compile-time safety.
 */
export type SettleContextWithFinancials = SettleContext & {
  financials: SettleFinancials;
};
