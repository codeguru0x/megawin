/**
 * Power 6/55 – Ticket Entry Entity (Đơn cược tham gia 1 kỳ quay)
 *
 * 1 Entry = 1 Ticket × 1 Draw.
 * Đây là đơn vị NHỎ NHẤT cho tất cả operations:
 * - Settle: match lines → tính thưởng → ghi payout
 * - Report: aggregate revenue/payout theo drawDate/tenant
 * - Payout: dispatch tiền thưởng cho tenant
 * - Void: hoàn tiền khi kỳ quay bị huỷ
 * - Feed: sync sang entryFeed cho tenant polling
 *
 * Entry mang snapshot đầy đủ boards từ ticket gốc → settle độc lập,
 * không cần join ticket document.
 *
 * Lifecycle (EntryStatus từ game-core):
 *   scheduled → settled
 *              ↘ void
 *
 * Collection: power655_ticket_entries.
 */

import type { EntryStatus, EntryOutcome } from "@megawin/game-core/entities";
import type { Long } from "@megawin/game-core/types";
import type { PrizeTier } from "./enums";
import type { PlayType } from "./enums";
import type { Board } from "./ticket";
import type { ISODateString } from "./types";

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Tóm tắt nội dung entry – dùng cho UI hiển thị mà không cần lookup ticket. */
export interface EntrySummary {
  /** Mã vé hiển thị cho khách. */
  ticketNo: string;
  /** Snapshot các board từ vé gốc. */
  boards: EntryBoardSnapshot[];
}

/** Kết quả kỳ quay (ghi lại khi publish result). */
export interface EntryResult {
  /** 6 số chính trúng thưởng, sorted ascending. */
  winningMain: string[];

  /** Số bonus – quay từ 49 quả bóng còn lại sau khi rút 6. */
  bonusNumber: string;

  /** Thời điểm công bố kết quả. */
  publishedAt: Date;
}

/**
 * Thông tin trả thưởng cho entry thắng.
 * Ghi sau settle – dùng cho dispatch payout worker.
 */
export interface EntryPayout {
  /**
   * Tổng tiền thắng (VND).
   * Công thức: Σ(tiers[].amount). JP1/JP2 = 0 tại SettleEntries, patch ở FinalizeSettle.
   */
  winAmount: number;
  /** Tiền thực trả (= winAmount, có thể điều chỉnh trong tương lai). */
  payoutAmount: number;
  /** Chi tiết thắng theo từng hạng giải. */
  tiers: EntryPayoutTier[];
  /** Thời điểm settle (tính toán kết quả). */
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
 * Thông tin huỷ entry khi kỳ quay bị void.
 * Chỉ có khi entry bị void (draw void / admin void).
 */
export interface EntryVoidInfo {
  /** Số tiền gốc của entry (= amount). */
  originalAmount: number;
  /** Số tiền hoàn trả cho player (VND). */
  refundAmount: number;
  /** Thời điểm huỷ. */
  voidedAt: Date;

  /**
   * Idempotency key cho refund transaction — UUIDv7 (RFC 9562).
   *
   * Sinh tại void time, ghi atomic cùng void data. Worker-tenant-dispatch dùng
   * làm `TenantDispatchOrderDoc.tx` — retry luôn gửi cùng giá trị → tenant idempotent.
   *
   * Trạng thái dispatch lưu tại `tenant_dispatch_orders` — KHÔNG còn trên entry.
   *
   * @example `"01907a12-c3d4-7abc-9ef0-123456789abc"`
   */
  refundTx: string;
}

// ─────────────────────────────────────────────
// Entry Document
// ─────────────────────────────────────────────

/**
 * Snapshot thông tin hoa hồng đại lý tại thời điểm place-bet.
 *
 * Snapshot cứng: dùng rate + amount tại thời điểm mua,
 * không thay đổi dù tenant config update sau.
 * Khi report, agg SUM(tenant.commissionAmount) → tổng hoa hồng chính xác.
 */
export interface EntryTenantSnapshot {
  /** Tỷ lệ hoa hồng đại lý áp dụng cho entry này. Ví dụ: 0.20 = 20%. */
  commissionRate: number;
  /**
   * Tiền hoa hồng (VND).
   * Công thức: Math.round(amount × commissionRate). Tính sẵn lúc place-bet.
   */
  commissionAmount: number;
}

/**
 * MongoDB document cho entry Power 6/55.
 * Collection: power655_ticket_entries.
 */
export interface TicketEntryDoc {
  /** MongoDB ObjectId – khóa chính nội bộ. Không dùng trong business logic. */
  _id: unknown;

  // ───── Partition / Ownership ─────

  /**
   * Tenant/đại lý sở hữu entry.
   * Key chính cho báo cáo tenant backoffice + megawin backoffice.
   */
  tenantId: string;
  /** ID tài khoản người chơi. */
  accountId: string;
  /** Tên đăng nhập người chơi (snapshot lúc place-bet). */
  username: string;
  /**
   * IP address của player lúc đặt cược (IPv4 hoặc IPv6).
   * Snapshot từ ticket, lưu để audit trail.
   */
  ipAddress?: string;
  /** Tham chiếu đến ticket gốc (ObjectId as string). */
  ticketId: string;

  // ───── Draw Snapshot ─────

  /** Mã kỳ quay: "YYYY-MM-DD.001". Join key với draws. */
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
   * Snapshot hoa hồng đại lý tại thời điểm place-bet.
   *
   * Snapshot cứng: không thay đổi dù tenant config update sau.
   * Khi settle, agg SUM(tenant.commissionAmount) → tổng hoa hồng chính xác.
   */
  tenant: EntryTenantSnapshot;

  // ───── Entry Status ─────

  /** Trạng thái lifecycle: scheduled → settled / void. */
  status: EntryStatus;

  // ───── Stake (tiền cược kỳ này) ─────

  /** Tổng line của entry trong kỳ này (= Σ boards[].derived.expandedLines). */
  lineCount: number;

  /**
   * Tổng đơn vị cược = Σ(expandedLines × betCount).
   * Dùng để tính tiền: amount = betUnitCount × unitPrice.
   */
  betUnitCount: number;

  /**
   * Tiền cược kỳ này (VND) = betUnitCount × unitPrice.
   */
  amount: number;

  /** Giá 1 line tại thời điểm mua (snapshot từ config). */
  unitPrice: number;

  // ───── Entry Summary (snapshot cho UI) ─────

  /** Snapshot tối thiểu từ ticket – UI hiển thị mà không cần lookup ticket. */
  entrySummary: EntrySummary;

  // ───── Result Snapshot (khi draw published) ─────

  /** Kết quả kỳ quay – copy từ draw.result khi publish. */
  result?: EntryResult;

  // ───── Outcome ─────

  /** Kết quả thắng/thua (ghi sau settle). */
  outcome?: EntryOutcome;

  // ───── Payout (khi settle xong) ─────

  /** Chi tiết trả thưởng (chỉ có sau settle, outcome = win). */
  payout?: EntryPayout;

  // ───── Void / Refund ─────

  /**
   * Thông tin huỷ cược + hoàn tiền.
   * Chỉ có khi entry bị void (draw void / admin void).
   */
  voidInfo?: EntryVoidInfo;

  // ───── Reversal (Resettle) ─────

  /**
   * Snapshot reversal — chỉ tồn tại khi entry đã đi qua ÍT NHẤT 1 phiên resettle.
   *
   * Vai trò kép: (a) dispatch payload giữa PrepareResettle → FinalizeSettle;
   * (b) audit trail sau FinalizeSettle.
   * Xem JSDoc {@link EntryReversal} cho semantic đầy đủ và workflow chi tiết.
   */
  reversal?: EntryReversal;

  // ───── Timestamps ─────

  /** Thời điểm tạo document. */
  createdAt: Date;
  /** Thời điểm cập nhật gần nhất. */
  updatedAt: Date;

  // ───── Change Tracking ─────

  /**
   * Global change sequence (BSON Long / Int64).
   * Gán từ entryChangeSeq mỗi khi entry được insert hoặc update.
   * Worker dùng field này để detect thay đổi: version > lastProcessedVersion.
   */
  version: Long;
}

/**
 * Snapshot reversal cho 1 phiên resettle — chỉ tồn tại khi entry đã đi qua
 * ÍT NHẤT 1 phiên resettle.
 *
 * Workflow resettle (xem `trigger-resettle.ts` và `prepare-resettle.ts`):
 *   1. `TriggerResettle` (BO API): sinh `resettleId` (UUIDv7) làm session key.
 *   2. `PrepareResettle` step 1 (`clearReversalSnapshot`): wipe reversal phiên cũ
 *      để tránh entries thắng phiên N-1 nhưng KHÔNG thắng phiên N lingers reversal cũ
 *      → double-debit nếu không wipe.
 *   3. `PrepareResettle` step 2 (`bulkSetReversal`): copy `payout.payoutAmount` cũ
 *      sang `reversalAmount`, sinh MỚI `reversalTx` (UUIDv7), ghi atomic cùng
 *      `resettleId`. Sau đó `resetEntriesForResettle` reset entry về `Scheduled`.
 *   4. `EnqueueReversals`: đọc `reversal.reversalTx` + `reversalAmount` để tạo
 *      reversal dispatch order (debit tenant).
 *   5. `FinalizeSettle` (resettle path): KHÔNG clear `reversal` field — giữ làm
 *      audit trail của phiên resettle gần nhất.
 *
 * **SEMANTIC KÉP** — field này có 2 vai trò theo lifecycle:
 *  (a) Dispatch payload: giữa `PrepareResettle` và `FinalizeSettle` (phiên đang chạy).
 *  (b) Audit trail: sau `FinalizeSettle`, trước phiên resettle kế tiếp.
 *
 * IDEMPOTENT: `reversalTx` UUIDv7 unique → outbox unique index reject duplicate.
 */
export interface EntryReversal {
  /**
   * Idempotency key cho reversal dispatch transaction — UUIDv7 (RFC 9562).
   *
   * Sinh MỚI tại `PrepareResettle` (KHÔNG copy từ `payout.payoutTx` cũ — payout
   * cũ đã dispatch xong, reversal là transaction mới độc lập).
   * Ghi atomic cùng `reversalAmount` + `resettleId` qua `bulkSetReversal`.
   * `EnqueueReversals` seed vào `TenantDispatchOrderDoc.tx` để outbox dispatch
   * idempotent xuống tenant.
   *
   * @example `"01a0b1c2-d3e4-7fab-89cd-ef0123456789"`
   */
  reversalTx: string;

  /**
   * Số tiền cần ghi nợ (debit) lại tenant — copy từ `payout.payoutAmount`
   * tại thời điểm snapshot (VND).
   * Đây là số tiền đã credit cho tenant ở phiên settle/resettle TRƯỚC, cần đảo ngược.
   */
  reversalAmount: number;

  /**
   * Session ID của phiên resettle đã tạo reversal này — UUIDv7.
   * Dùng để correlate audit trail theo phiên (nhiều entries, 1 resettleId).
   * Cũng là discriminator để biết reversal này thuộc phiên nào nếu cần debug.
   */
  resettleId: string;
}

/** Application layer entity (version chuyển Long → string). */
export interface TicketEntryEntity extends Omit<TicketEntryDoc, "_id" | "version"> {
  /** ObjectId dạng hex string – khóa chính dùng trong application layer. */
  id: string;
  /** Version dạng string (BigInt serialized). Dùng cho feed sync. */
  version: string;
}

// ─────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────

/** Snapshot 1 board trong entry – chỉ lưu selection, không lưu lines. */
export interface EntryBoardSnapshot {
  /** Ký hiệu board ("A".."E"). */
  boardNo: string;
  /** Kiểu chơi (standard / bao5 / bao7-18). */
  playType: PlayType;
  /** Danh sách số chính người chơi đã chọn ("01"-"55"). */
  mainNumbers: string[];
  /**
   * Số line sau khi expand từ board.
   * - Standard: 1
   * - Bao5: 55 - 5 = 50
   * - Bao7: C(7,6) = 7, Bao18: C(18,6) = 18.564
   */
  expandedLines: number;
  /** Số lần cược nhân bội (≥ minBetCount). Snapshot từ ticket board lúc place-bet. */
  betCount: number;
}

/**
 * Chi tiết trúng thưởng 1 hạng giải trong entry (Power 6/55).
 *
 * ─────────────────────────────────────────────────────────────────
 * VÌ SAO KHÔNG CÓ `betUnitCount`? (KHÔNG phải thiếu sót — đây là chủ đích)
 * ─────────────────────────────────────────────────────────────────
 *
 * Câu hỏi: cả giải cố định (tier1/2/3) lẫn Jackpot (JP1/JP2) đều phải nhân
 * betCount theo luật Vietlott — vậy sao tier KHÔNG cần lưu `betUnitCount`?
 *
 * Trả lời: `betUnitCount` trên tier CHỈ cần khi game phải aggregate
 * `Σ(betCount của lines trúng) per tier` **TỪ entry collection** sau settle
 * (ví dụ Split Cycle của Lotto 5/35 chia Jackpot tích luỹ xuống tier1–tier5
 * theo tỷ lệ giá trị tham gia dự thưởng). Power 6/55 KHÔNG rơi vào nhóm này:
 *
 *   1. KHÔNG có Split Cycle (theo luật Vietlott — Jackpot chỉ tích luỹ đến
 *      khi có winner, không chia xuống giải thấp hơn). Cơ chế Overflow
 *      (JP1 vượt ngưỡng) chỉ CHUYỂN phần dư sang JP2, KHÔNG phân bổ xuống
 *      tier1/2/3 theo tỷ lệ betCount.
 *
 *   2. Khi chia Jackpot cho nhiều winners, `PatchJackpotPrize` lấy betCount
 *      TRỰC TIẾP từ line collection (`getJackpotWinningLines` →
 *      `totalBetUnits = Σ(line.betCount)`), KHÔNG đọc `EntryPayoutTier.betUnitCount`.
 *      Line collection là nguồn chính xác hơn — chứa từng line vật lý trúng JP.
 *
 * → Lưu `betUnitCount` trên tier sẽ là dead field: không nơi nào đọc, chỉ tốn
 *   storage và tạo rủi ro lệch số liệu. Vì vậy CỐ TÌNH bỏ.
 *
 * ─────────────────────────────────────────────────────────────────
 * betCount VẪN ĐƯỢC NHÂN ĐÚNG — chỉ là KHÔNG qua field `betUnitCount`:
 * ─────────────────────────────────────────────────────────────────
 *
 *   • Giải cố định (tier1/2/3): `SettleEntries` ghi mỗi line
 *       `winAmount = unitAmount × betCount`
 *     → `amount = Σ(winAmount per line)` — đã nhân betCount sẵn.
 *
 *   • Jackpot (JP1/JP2): `amount = 0` tại settle; `PatchJackpotPrize` patch
 *       `amount = jackpotPerUnit × entryBetUnits`
 *     với `entryBetUnits = Σ(line.betCount)` lấy từ line collection.
 *
 * ─────────────────────────────────────────────────────────────────
 * NGUỒN LUẬT VIETLOTT (đã đối chiếu thể lệ chính thức):
 * ─────────────────────────────────────────────────────────────────
 *   "Trong trường hợp có nhiều người trúng thưởng giải Jackpot thì giải
 *    Jackpot được chia đều theo tỷ lệ giá trị tham gia dự thưởng của người
 *    trúng thưởng."
 *   "Giá trị lĩnh thưởng của các giải thưởng từ Giải Nhất đến Giải Ba được
 *    tính theo số lần tham gia dự thưởng (01 lần = 10.000đ) nhân với giá trị
 *    giải thưởng tương ứng với 01 lần tham gia."
 *   Nguồn: https://info.vietlott-sms.vn/game_power.html
 *
 * → "Giá trị tham gia dự thưởng" = `betCount`. Code chia Jackpot theo betCount
 *   (không chia đều per-người) là ĐÚNG luật.
 *
 * Để xem game CẦN `betUnitCount` (có Split Cycle) hoạt động ra sao và ví dụ
 * phân bổ sai nếu dùng hitCount thay vì betUnitCount, đọc JSDoc của
 * `EntryPayoutTier` trong `@megawin/game-lotto535/entities`.
 * ─────────────────────────────────────────────────────────────────
 */
export interface EntryPayoutTier {
  /** Hạng giải: jackpot1, jackpot2, tier1, tier2, tier3. */
  tier: PrizeTier;

  /**
   * Số lines vật lý trúng hạng này — KHÔNG nhân betCount.
   * Đây là số đầu vé thực tế khớp tier, không phải số đơn vị tham gia dự thưởng.
   * (Số đơn vị = `Σ(line.betCount)`, lấy từ line collection khi cần — xem JSDoc interface.)
   */
  hitCount: number;

  /**
   * Tiền thưởng cho 01 lần tham gia dự thưởng (VND) — đơn giá theo luật Vietlott.
   * tier1/2/3: hằng số theo bảng giải.
   * JP1/JP2: = 0 tại SettleEntries; patch ở PatchJackpotPrize = `jackpotPerUnit`
   * khi đã biết pool + tổng betUnits winners.
   */
  unitAmount: number;

  /**
   * Tổng tiền hạng này cho entry (VND) — ĐÃ nhân betCount.
   * Player betCount=3 trúng tier1 nhận gấp 3 player betCount=1.
   *
   * tier1/2/3: `amount = Σ(winAmount per line)` = `hitCount × unitAmount × betCount` (khi 1 board).
   * JP1/JP2:   `amount = jackpotPerUnit × entryBetUnits` (patch ở PatchJackpotPrize),
   *            với `entryBetUnits = Σ(line.betCount)` của các line trúng JP — lấy từ line collection.
   */
  amount: number;
}
