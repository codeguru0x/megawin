/**
 * Lotto 5/35 – Ticket Entry Document
 *
 * Collection: lotto535TicketEntries
 *
 * 1 document = 1 ticket tham gia 1 kỳ quay (draw) cụ thể.
 * Đây là đơn vị vận hành chính:
 *   - Settle theo drawId
 *   - Báo cáo theo tenantId + drawDate
 *   - Lịch sử chơi theo accountId + drawDate
 *
 * LƯU Ý cho báo cáo:
 * - tenantId luôn được lưu ở top-level để query nhanh (compound index).
 * - financialDate (ISODateString) dùng cho report/aggregation hàng ngày.
 * - amount (tiền cược) lưu sẵn để tránh join với ticket khi report.
 *
 * Pattern naming: {Game}TicketEntryDoc – áp dụng cho mọi game.
 */

import type { EntryOutcome, EntryStatus } from "@megawin/game-core/entities";
import type { Long } from "@megawin/game-core/types";

import type { PlayType, PrizeTier } from "./enums";
import type { ISODateString } from "./types";

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Snapshot thông tin đại lý tại thời điểm tạo entry. */
export interface EntryTenantSnapshot {
  /** Tỷ lệ hoa hồng đại lý áp dụng cho entry này. Ví dụ: 0.20 = 20%. */
  commissionRate: number;
  /** Tiền hoa hồng = Math.round(amount × commissionRate). Tính sẵn lúc place-bet. */
  commissionAmount: number;
}

/** Snapshot tối thiểu từ ticket – UI hiển thị mà không cần lookup ticket. */
export interface EntrySummary {
  /** Mã vé hiển thị. */
  ticketNo: string;
  /** Snapshot boards (lựa chọn, không phải lines expand). */
  boards: EntryBoardSnapshot[];
}

/** Kết quả kỳ quay – copy từ draw.result khi settle. */
export interface EntryResult {
  /**
   * 5 số chính trúng thưởng theo thứ tự quay gốc (không sort).
   * Lưu dạng string[] (zero-padded "01"-"35") — dùng trực tiếp từ MongoDB, tránh cast.
   */
  winningMain: string[];
  /**
   * Số đặc biệt trúng thưởng theo thứ tự quay gốc.
   * Lưu dạng string (zero-padded "01"-"12").
   */
  winningSpecial: string;

  /** Thời điểm công bố kết quả. */
  publishedAt: Date;
}

/** Chi tiết trả thưởng cho entry này. Chỉ có sau khi settle. */
export interface EntryPayout {
  /** Tổng tiền thắng kỳ này (VND). = 0 khi thua, > 0 khi thắng. */
  winAmount: number;
  /**
   * Tiền trả thưởng thực tế cho khách (sau thuế/phí nếu có).
   * Hiện tại = winAmount (chưa có thuế).
   */
  payoutAmount: number;

  /** Chi tiết theo từng hạng giải. */
  tiers: EntryPayoutTier[];

  /** Thời điểm settle. */
  settledAt: Date;

  /**
   * Idempotency key cho payout transaction — UUIDv7 (RFC 9562).
   *
   * Sinh tại settle time, ghi atomic cùng payout data.
   * `EnqueueDispatchPayouts` đọc field này, seed vào `TenantDispatchOrderDoc.tx`
   * để worker gửi tenant idempotent. Chỉ sinh khi entry thắng (có payout cần dispatch).
   *
   * Trạng thái dispatch (pending/dispatched/failed) lưu tại
   * `tenant_dispatch_orders` — KHÔNG còn lưu trên entry.
   *
   * @example `"019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b"`
   */
  payoutTx?: string;
}

/**
 * Thông tin huỷ cược + hoàn tiền.
 * Chỉ có khi entry bị void (draw void / admin void).
 */
export interface EntryVoidInfo {
  /** Tiền cược gốc của entry này (= amount). */
  originalAmount: number;
  /** Tiền hoàn trả cho player. */
  refundAmount: number;
  /** Thời điểm huỷ. */
  voidedAt: Date;

  /**
   * Idempotency key cho refund transaction — UUIDv7 (RFC 9562).
   *
   * Sinh tại void time, ghi atomic cùng void data.
   * Mọi entry bị void đều phát sinh refund → field này required.
   * `EnqueueDispatchRefunds` seed vào `TenantDispatchOrderDoc.tx`.
   *
   * Trạng thái dispatch refund (pending/dispatched/failed) lưu tại
   * `tenant_dispatch_orders` — KHÔNG còn lưu trên entry.
   *
   * @example `"01907a12-c3d4-7abc-9ef0-123456789abc"`
   */
  refundTx: string;
}

// ─────────────────────────────────────────────
// Entry Document
// ─────────────────────────────────────────────

export interface TicketEntryDoc {
  _id: unknown;

  // ───── Partition / Ownership ─────

  /**
   * Tenant/đại lý sở hữu entry.
   * Key chính cho báo cáo tenant backoffice + megawin backoffice.
   */
  tenantId: string;

  /** ID tài khoản chung (hệ thống account service). */
  accountId: string;

  /** Username hiển thị của player. */
  username: string;

  /**
   * IP address của player lúc đặt cược (IPv4 hoặc IPv6).
   * Snapshot từ ticket, lưu để audit trail.
   */
  ipAddress?: string;

  /** Tham chiếu ticket gốc (ObjectId). */
  ticketId: string;

  // ───── Draw Snapshot ─────

  /**
   * ID kỳ quay cụ thể (ví dụ "2026-02-22.001").
   * Primary key để settle batch theo draw.
   */
  drawId: string;

  // ───── Financial Date ─────

  /**
   * Ngày tài chính mà entry này thuộc về, format "YYYY-MM-DD".
   * Dùng cho báo cáo tài chính hàng ngày (không nhất thiết = drawDate).
   * Business rule: ngày tài chính tính từ 11h sáng → 11h sáng hôm sau.
   * Compound index: { tenantId, financialDate } cho report query.
   */
  financialDate: ISODateString;

  // ───── Tenant (snapshot đại lý lúc đặt cược) ─────

  /**
   * Snapshot thông tin đại lý tại thời điểm tạo entry.
   *
   * Snapshot cứng: dùng rate + amount tại thời điểm mua,
   * không thay đổi dù tenant config update sau.
   * Khi settle, agg SUM(tenant.commissionAmount) → tổng hoa hồng chính xác.
   */
  tenant: EntryTenantSnapshot;

  // ───── Entry Status ─────

  /**
   * Trạng thái vòng đời entry.
   * pending → settled (có kết quả) hoặc pending → voided (kỳ quay bị huỷ).
   */
  status: EntryStatus;

  // ───── Stake (tiền cược kỳ này) ─────

  /** Tổng line của ticket trong kỳ này. */
  lineCount: number;

  /**
   * Tổng đơn vị cược = Σ(expandedLines × betCount).
   * Dùng để tính tiền: amount = betUnitCount × unitPrice.
   */
  betUnitCount: number;

  /**
   * Tiền cược kỳ này (VND) = betUnitCount × unitPrice.
   * Lưu sẵn (denormalized) để report nhanh, tránh join ticket.
   */
  amount: number;

  /** Giá 1 line tại thời điểm mua (snapshot). */
  unitPrice: number;

  // ───── Entry Summary (snapshot cho UI) ─────

  /** Snapshot tối thiểu từ ticket – UI hiển thị mà không cần lookup ticket. */
  entrySummary: EntrySummary;

  // ───── Result Snapshot (khi draw published) ─────

  /** Kết quả kỳ quay – copy từ draw.result khi publish. */
  result?: EntryResult;

  // ───── Outcome (kết quả thắng/thua – gán khi settle) ─────

  /**
   * Kết quả cuối cùng của entry sau khi settle.
   * Dùng cho query/filter nhanh, hiển thị UI.
   * Chỉ có sau khi settle xong.
   */
  outcome?: EntryOutcome;

  // ───── Payout (khi settle xong) ─────

  /** Chi tiết trả thưởng cho entry này. Chỉ có sau khi settle. */
  payout?: EntryPayout;

  // ───── Void / Refund (khi draw bị huỷ) ─────

  /**
   * Thông tin huỷ cược + hoàn tiền.
   * Chỉ có khi entry bị void (draw void / admin void).
   */
  voidInfo?: EntryVoidInfo;

  // ───── Reversal (Resettle) ─────

  /**
   * Snapshot reversal — chỉ tồn tại khi entry đã đi qua ít nhất 1 phiên resettle.
   * Xem {@link EntryReversal}.
   */
  reversal?: EntryReversal;

  // ───── Timestamps ─────

  /** Thời điểm tạo entry (= thời điểm place-bet thành công). */
  createdAt: Date;
  /** Thời điểm cập nhật gần nhất (settle, void, payout dispatch...). */
  updatedAt: Date;

  // ───── Change Tracking ─────

  /**
   * Global change sequence (BSON Long / Int64).
   * Gán từ entryChangeSeq mỗi khi entry được insert hoặc update.
   * Worker dùng field này để detect thay đổi: version > lastProcessedVersion.
   */
  version: Long;
}

// ─────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────

/** Snapshot 1 board trong entry – chỉ lưu selection, không lưu lines. */
export interface EntryBoardSnapshot {
  /** Mã board ("A", "B", "C", "D", "E"). */
  boardNo: string;

  /** Kiểu chơi của board (standard, mainCover, specialCover...). */
  playType: PlayType;

  /** Các số chính user chọn — string zero-padded, sorted tăng dần. */
  mainNumbers: string[];

  /** Các số đặc biệt user chọn — string zero-padded, sorted tăng dần. */
  specialNumbers: string[];

  /** Số line con sinh ra từ board. */
  expandedLines: number;

  /** Số lần cược nhân bội (≥ minBetCount). Snapshot từ ticket board. */
  betCount: number;
}

/**
 * Chi tiết trả thưởng cho 1 hạng giải trong entry (Lotto 5/35).
 *
 * ─────────────────────────────────────────────────────────────────
 * VÌ SAO LOTTO 5/35 CÓ `betUnitCount` CÒN MEGA 6/45 / POWER 6/55 THÌ KHÔNG?
 * ─────────────────────────────────────────────────────────────────
 *
 * Cả 3 game đều lưu `winAmount = unitAmount × betCount` vào từng line doc
 * khi settle → `EntryPayoutTier.amount = Σ(winAmount)` đều đúng ở cả 3 game.
 *
 * Điểm khác biệt: Lotto 5/35 có **Split Cycle** (chia Jackpot tích luỹ
 * xuống tier1–tier5 khi JP >= 12 tỷ và không ai trúng JP).
 * Bonus split được phân bổ theo **tỷ lệ đơn vị tham gia dự thưởng** (betCount),
 * không phải theo số lines vật lý (hitCount).
 *
 * Để tính tỷ lệ đó, `CalculateFinancials` cần biết:
 *   `tierBetUnitCounts[tier] = Σ(betUnitCount của tất cả entries trúng tier)`
 *
 * Số liệu này được aggregate trực tiếp từ entry collection qua $group:
 *   `$sum: "$payout.tiers.betUnitCount"`
 *
 * Nếu không lưu `betUnitCount` trong tier, phải query thêm line collection riêng
 * → thêm DB round-trip, tách khỏi $facet đang aggregate entries 1 lần duy nhất.
 *
 * Mega 6/45 và Power 6/55 không có Split Cycle nên không cần số liệu này
 * → không lưu `betUnitCount` trong tier, tiết kiệm storage và giữ schema gọn.
 *
 * ─────────────────────────────────────────────────────────────────
 * VÍ DỤ — Split Cycle phân bổ SAI nếu dùng hitCount thay vì betUnitCount:
 * ─────────────────────────────────────────────────────────────────
 *
 * Kỳ split: jackpotPool = 12.000.000.000 VND, tier1 nhận 2/6 = 4.000.000.000.
 *
 * Player A: Bao 6 (6 lines), betCount = 3, trúng 2 lines tier1
 *   → hitCount = 2, betUnitCount = 2 × 3 = 6
 *   → đóng góp 6 × 10.000đ = 60.000đ để tham gia dự thưởng tier1
 *
 * Player B: Standard (1 line), betCount = 1, trúng 1 line tier1
 *   → hitCount = 1, betUnitCount = 1 × 1 = 1
 *   → đóng góp 1 × 10.000đ = 10.000đ để tham gia dự thưởng tier1
 *
 * Tổng betUnitCount tier1 toàn kỳ = 6 + 1 = 7 đơn vị.
 * bonusPerUnit = floor(4.000.000.000 / 7) = 571.428.571 VND.
 *
 * Phân bổ ĐÚNG (theo betUnitCount):
 *   Player A nhận: 571.428.571 × 6 = 3.428.571.426 VND
 *   Player B nhận: 571.428.571 × 1 =   571.428.571 VND
 *   Tổng = 3.999.999.997 VND ✓ (sai số do floor, đúng luật)
 *
 * Phân bổ SAI (nếu dùng hitCount):
 *   Tổng hitCount = 2 + 1 = 3, bonusPerHit = floor(4.000.000.000 / 3) = 1.333.333.333.
 *   Player A nhận: 1.333.333.333 × 2 = 2.666.666.666 VND ← thiếu ~762 triệu
 *   Player B nhận: 1.333.333.333 × 1 = 1.333.333.333 VND ← dư ~762 triệu
 *   → Vi phạm luật Vietlott: "chia theo tỷ lệ giá trị tham gia dự thưởng"
 *
 * ─────────────────────────────────────────────────────────────────
 * QUY TẮC THIẾT KẾ:
 * ─────────────────────────────────────────────────────────────────
 * Thêm `betUnitCount` vào `EntryPayoutTier` khi và chỉ khi game có cơ chế
 * cần aggregate `Σ(betCount × hitCount)` per tier **từ entry collection**
 * sau khi settle xong (ví dụ: split cycle, bonus distribution theo tỷ lệ).
 */
export interface EntryPayoutTier {
  /** Hạng giải – type-safe enum. */
  tier: PrizeTier;

  /** Số lines vật lý trúng hạng này (không nhân betCount). */
  hitCount: number;

  /**
   * Tổng đơn vị cược trúng hạng này = Σ(betCount) của các lines trúng tier.
   *
   * Khác `hitCount`: `betUnitCount = hitCount × betCount` (khi 1 board, 1 betCount).
   * Với multi-board hoặc betCount > 1: chỉ cộng betCount của lines **thuộc tier này**.
   *
   * Dùng cho 2 mục đích:
   *   1. `aggregateSettleSummary` → `tierBetUnitCounts` → đầu vào `calculateSplitDistribution`
   *   2. `applySplitBonusForTier` → tính bonus từng entry = bonusPerUnit × betUnitCount
   */
  betUnitCount: number;

  /**
   * Tiền thưởng mỗi đơn vị tham gia dự thưởng (VND).
   * Giải cố định: = prizeTable[tier]. Jackpot: = 0 tại SettleEntries, patch ở PatchJackpotPrize.
   */
  unitAmount: number;

  /**
   * Tổng tiền hạng này (VND) = unitAmount × betUnitCount.
   * Đã nhân betCount — entry betCount=3 trúng tier2 nhận gấp 3 entry betCount=1.
   */
  amount: number;

  /**
   * Đánh dấu tier này là phần thưởng bổ sung từ Split Cycle (chia Jackpot tích luỹ).
   * Khi `true`: tier được thêm bởi `ApplySplitBonuses` sau settle, không phải từ kết quả quay.
   * Khi `false` hoặc `undefined`: tier từ kết quả khớp số bình thường.
   */
  isSplitBonus?: boolean;
}

/**
 * Snapshot reversal cho resettle — debit lại payout cũ trước khi re-settle.
 *
 * Workflow: PrepareResettle snapshot → EnqueueReversals dispatch → giữ audit sau FinalizeSettle.
 */
export interface EntryReversal {
  /** Idempotency key reversal dispatch — UUIDv7, sinh mới mỗi phiên resettle. */
  reversalTx: string;
  /** Số tiền debit tenant (VND) — copy từ `payout.payoutAmount` lúc snapshot. */
  reversalAmount: number;
  /** Session resettle (UUIDv7) — correlate audit theo phiên. */
  resettleId: string;
}

/**
 * Application-layer entity sau khi qua mapper.
 *
 * Chuyển đổi so với TicketEntryDoc:
 * - `_id` (ObjectId) → `id` (hex string).
 * - `version` (BSON Long) → `version` (string) – safe cho JSON serialize.
 */
export interface TicketEntryEntity extends Omit<TicketEntryDoc, "_id" | "version"> {
  /** MongoDB ObjectId đã chuyển sang hex string. */
  id: string;
  /**
   * Global change sequence đã convert từ BSON Long → string.
   * Dùng cho feed sync detect thay đổi.
   */
  version: string;
}
