/**
 * Keno – Ticket Entry Document
 *
 * Collection: kenoTicketEntries
 *
 * 1 document = 1 ticket tham gia 1 kỳ quay Keno cụ thể.
 * Đơn vị vận hành chính cho settle + report.
 *
 * Số lưu dạng string "01"-"80" trong entrySummary.boards.
 * Kết quả quay (result.winningNumbers) cũng dùng string[] "01"-"80".
 *
 * boards[] chứa cả cách chơi cơ bản (pick1-pick10) và bổ sung (bigSmall/evenOdd),
 * phân biệt qua playType. Tương tự boardPayouts[] chứa payout cho tất cả boards.
 */

import type { KenoBigSmallBet, KenoEvenOddBet, KenoPlayType } from "./enums";
import type { EntryStatus, EntryOutcome } from "@megawin/game-core/entities";
import type { ISODateString } from "./types";
import type { Long } from "@megawin/game-core/types";

/**
 * Các bậc chơi (pickCount) mà giải thưởng cao nhất có giới hạn trả thưởng mỗi kỳ.
 *
 * Quy tắc Vietlott Keno:
 *   - Bậc 8 trùng 8: ≤50 bộ → 200tr/bộ (cố định), >50 bộ → 10 tỷ chia đều
 *   - Bậc 9 trùng 9: ≤12 bộ → 800tr/bộ (cố định), >12 bộ → 10 tỷ chia đều
 *   - Bậc 10 trùng 10: ≤5 bộ → 2 tỷ/bộ (cố định), >5 bộ → 10 tỷ chia đều
 *
 * Dùng bởi SettleEntries (gắn flag) và ApplyPayoutCaps (query nhanh).
 */
export const CAPPABLE_PICK_COUNTS: ReadonlySet<number> = new Set([8, 9, 10]);

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Snapshot thông tin đại lý tại thời điểm tạo entry. */
export interface EntryTenantSnapshot {
  /** Tỷ lệ hoa hồng đại lý. Ví dụ: 0.20 = 20%. */
  commissionRate: number;
  /** Tiền hoa hồng = Math.round(amount × commissionRate). Tính sẵn lúc place-bet. */
  commissionAmount: number;
}

/** Tóm tắt nội dung entry, snapshot từ ticket. boards[] chứa cả cơ bản và bổ sung. */
export interface EntrySummary {
  ticketNo: string;
  boards: EntryBoardSnapshot[];
}

/** Snapshot kết quả kỳ quay. Copy từ draw khi settle. */
export interface EntryResult {
  winningNumbers: string[];
  publishedAt: Date;
  bigCount: number;
  smallCount: number;
  evenCount: number;
  oddCount: number;
}

/** Chi tiết thanh toán. Set sau khi settle. */
export interface EntryPayout {
  /** Tổng tiền thắng = Σ(boardPayouts[].winAmount). */
  winAmount: number;
  /** Tiền trả cho player. Thường = winAmount. Sau ApplyPayoutCaps có thể giảm. */
  payoutAmount: number;
  /** Chi tiết thắng/thua từng board (cả cơ bản và bổ sung). */
  boardPayouts: EntryBoardPayout[];
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
   * Lifecycle resettle (Giai đoạn 2): khi resettle, field này bị overwrite bằng
   * UUIDv7 mới atomic cùng `reversalTx` + `reversalAmount` snapshot payout cũ.
   * Giá trị cũ đã được record trong `tenant_dispatch_orders` — không mất, tra qua
   * `listBySource({ gameId, sourceKind: "payout", sourceId: entryId })`.
   *
   * @example `"019078a0-b4c5-7def-8a3b-1c2d3e4f5a6b"`
   */
  payoutTx?: string;
}

/**
 * Snapshot reversal — chỉ tồn tại khi entry đã đi qua ÍT NHẤT 1 phiên resettle.
 *
 * Workflow resettle:
 *   1. `TriggerResettle` (BO API): sinh `resettleId` (UUIDv7) làm session key.
 *   2. `PrepareResettle` step 1 (`clearReversalSnapshot`): wipe reversal phiên
 *      cũ (đảm bảo entries thắng phiên N-1 nhưng KHÔNG thắng phiên N không
 *      lingers reversal cũ → tránh re-enqueue double-debit).
 *   3. `PrepareResettle` step 2 (`bulkSetReversal`): copy `payout.payoutAmount`
 *      (cũ) sang `reversalAmount`, sinh MỚI `reversalTx` (UUIDv7) làm idempotency
 *      key cho dispatch reversal, ghi atomic cùng `resettleId`. KHÔNG snapshot
 *      `payout.payoutTx` cũ — payoutTx cũ đã được dispatch xong (FIFO outbox);
 *      reversal là transaction MỚI, độc lập.
 *      Sau snapshot → reset entry về `Scheduled` để Settle SFN replay.
 *   4. `EnqueueReversals`: đọc `reversal.reversalTx` + `reversalAmount` để tạo
 *      reversal dispatch order (Debit ngược tenant).
 *   5. `FinalizeSettle` (resettle path): **KHÔNG** clear `reversal` field.
 *      Field giữ lại làm audit trail (xem semantic kép bên dưới).
 *
 * **SEMANTIC KÉP** — field này có 2 vai trò theo lifecycle:
 *
 * (a) **Dispatch payload** (giữa `PrepareResettle` và `FinalizeSettle`):
 *     `EnqueueReversals` đọc field để build dispatch order. Phải hợp lệ và
 *     khớp 1-1 với phiên resettle hiện tại.
 *
 * (b) **Audit trail** (sau `FinalizeSettle`, trước phiên resettle kế tiếp):
 *     Field giữ snapshot phiên resettle GẦN NHẤT — CS/forensic query trực
 *     tiếp trên entry doc:
 *       - `reversal.resettleId` → trace nhóm phiên resettle.
 *       - `reversal.reversalTx` → join `tenant_dispatch_orders` để xem trạng
 *         thái dispatch.
 *       - `reversal.reversalAmount` → so với `payout.payoutAmount` mới: biết
 *         phiên resettle giảm/tăng bao nhiêu cho vé này.
 *     **Audit chỉ giữ phiên gần nhất** — phiên N+1 overwrite phiên N. Cần audit
 *     đầy đủ chuỗi phiên → query `tenant_dispatch_orders` với
 *     `sourceKind=Reversal, sourceId=entryId`.
 *
 * **Lifecycle giữa 2 phiên resettle**:
 *   - Entry thắng cả phiên N và N+1: `bulkSetReversal` overwrite reversal phiên
 *     N+1 lên phiên N.
 *   - Entry thắng phiên N nhưng KHÔNG thắng N+1: `clearReversalSnapshot` ở
 *     `PrepareResettle.step1` của phiên N+1 wipe reversal phiên N → bắt buộc
 *     để tránh `EnqueueReversals` phiên N+1 trả entry này (double-debit).
 *
 * IDEMPOTENT: `reversalTx` UUIDv7 unique → outbox unique index reject duplicate.
 */
export interface EntryReversal {
  /**
   * Idempotency key cho reversal dispatch transaction — UUIDv7 (RFC 9562).
   *
   * Sinh MỚI tại `PrepareResettle` (không copy từ `payout.payoutTx` cũ — payout cũ
   * là transaction đã dispatch, reversal là transaction mới độc lập).
   * Ghi atomic cùng `reversalAmount` + `resettleId` qua `bulkSetReversal`.
   * `EnqueueReversals` seed vào `TenantDispatchOrderDoc.tx` để outbox dispatch
   * idempotent xuống tenant.
   *
   * Sau `FinalizeSettle`: giữ lại làm audit pointer — join với
   * `tenant_dispatch_orders` để tra trạng thái dispatch của reversal.
   *
   * @example `"01a0b1c2-d3e4-7fab-89cd-ef0123456789"`
   */
  reversalTx: string;

  /**
   * Số tiền cần ghi nợ (debit) lại tenant — copy từ `payout.payoutAmount`
   * tại thời điểm snapshot (VND). Đây là số tiền đã credit cho tenant ở phiên
   * settle/resettle TRƯỚC, cần đảo ngược.
   *
   * Sau `FinalizeSettle`: giữ lại làm audit — so với `payout.payoutAmount` mới
   * để biết phiên resettle hiện tại đã thay đổi bao nhiêu cho vé này.
   */
  reversalAmount: number;

  /**
   * ID phiên resettle (UUIDv7) — sinh tại `TriggerResettle` BO API, propagate
   * xuyên SFN. Dùng để trace nhóm tất cả entry trong cùng phiên resettle, ghi
   * vào `TenantDispatchOrderDoc.metadata.resettleId`.
   *
   * Sau `FinalizeSettle`: giữ lại làm audit — trace cụ thể phiên nào đã
   * resettle vé này gần đây nhất.
   */
  resettleId: string;
}

/**
 * Thông tin huỷ cược + hoàn tiền.
 * Chỉ có khi entry bị void (draw void / admin void).
 *
 * Trạng thái dispatch refund (pending/dispatched/failed) lưu tại
 * `tenant_dispatch_orders` — KHÔNG còn lưu trên entry. `refundTx` giữ lại
 * làm idempotency seed khi enqueue dispatch.
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
   * ID đại lý sở hữu entry.
   */
  tenantId: string;

  /**
   * ID tài khoản player đặt cược.
   */
  accountId: string;

  /**
   * Tên đăng nhập player đặt cược.
   */
  username: string;

  /**
   * IP address của player lúc đặt cược (IPv4 hoặc IPv6).
   * Snapshot từ ticket, lưu để audit trail.
   */
  ipAddress?: string;

  /** Reference đến ticket gốc. Lưu dạng hex string (ObjectId.toHexString()). */
  ticketId: string;

  // ───── Draw Snapshot ─────
  /**
   * ID kỳ quay mà entry tham gia. Format: "YYYY-MM-DD.NNN".
   */
  drawId: string;

  /**
   * Ngày tài chính của kỳ quay. Snapshot từ draw, dùng cho báo cáo.
   */
  financialDate: ISODateString;

  // ───── Tenant (snapshot đại lý lúc đặt cược) ─────

  tenant: EntryTenantSnapshot;

  // ───── Entry Status ─────

  status: EntryStatus;

  // ───── Stake ─────

  /** Số selections = boards.length (cả cơ bản và bổ sung). */
  selectionCount: number;

  /**
   * Tổng đơn vị cược = Σ(board.betCount).
   * Dùng để tính tiền: amount = betUnitCount × unitPrice.
   */
  betUnitCount: number;

  /** Tổng tiền cược = betUnitCount × unitPrice (VND). */
  amount: number;

  unitPrice: number;

  // ───── Entry Summary ─────

  entrySummary: EntrySummary;

  // ───── Result Snapshot ─────

  result?: EntryResult;

  // ───── Outcome ─────

  outcome?: EntryOutcome;

  // ───── Payout ─────

  payout?: EntryPayout;

  // ───── Payout Cap Flag ─────

  /**
   * Flag đánh dấu entry có board trúng giải cao nhất ở bậc 8/9/10.
   *
   * Được gắn bởi SettleEntries khi entry có ít nhất 1 board mà:
   *   pickCount ∈ {8, 9, 10} VÀ matchCount === pickCount (trúng hết)
   *
   * Mục đích: tối ưu query cho step ApplyPayoutCaps.
   * Thay vì phải $unwind + $expr trên toàn bộ entries, chỉ cần
   * filter { hasCappablePrize: true } → nhanh và index-friendly.
   *
   * Quy tắc Vietlott: khi tổng số bộ trúng top prize vượt ngưỡng
   * cấu hình (maxSetsForFixed), giải thưởng phải chia đều từ maxPerDraw.
   *
   * Chỉ có khi entry đã settled và có board trúng top prize.
   * Undefined/false cho các entry khác.
   */
  hasCappablePrize?: boolean;

  // ───── Void / Refund (khi draw bị huỷ) ─────

  /**
   * Thông tin huỷ cược + hoàn tiền.
   * Chỉ có khi entry bị void (draw void / admin void).
   */
  voidInfo?: EntryVoidInfo;

  // ───── Reversal (khi resettle) ─────

  /**
   * Snapshot reversal — chỉ tồn tại khi entry đã đi qua ÍT NHẤT 1 phiên resettle.
   *
   * Set tại `PrepareResettle.bulkSetReversal`, KHÔNG clear ở `FinalizeSettle`
   * (giữ làm audit trail của phiên resettle gần nhất). Đọc bởi `EnqueueReversals`
   * (giữa Prepare và Finalize) và bởi CS/forensic queries (sau Finalize).
   *
   * Xem JSDoc {@link EntryReversal} cho semantic kép.
   */
  reversal?: EntryReversal;

  // ───── Timestamps ─────

  createdAt: Date;

  updatedAt: Date;

  version: Long;
}

// ─────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────

/**
 * Snapshot 1 board từ ticket — cả cơ bản (pick1-pick10) và bổ sung (bigSmall/evenOdd).
 *
 * - Cơ bản: boardNo + playType + numbers (bắt buộc), bet = undefined.
 * - Bổ sung: boardNo + playType + bet (bắt buộc), numbers = undefined.
 */
export interface EntryBoardSnapshot {
  /** Mã board: "A", "B", "C". */
  boardNo: string;
  /** Loại chơi: "pick1"–"pick10" (cơ bản) hoặc "bigSmall"/"evenOdd" (bổ sung). */
  playType: KenoPlayType;
  /**
   * Số dạng string "01"-"80".
   * Bắt buộc cho cơ bản (pick1-pick10), undefined cho bổ sung.
   */
  numbers?: string[];
  /**
   * Lựa chọn cụ thể cho side bet: "big"/"small"/"bigSmallDraw"/"even"/"odd"/...
   * Bắt buộc cho bổ sung (bigSmall/evenOdd), undefined cho cơ bản.
   */
  bet?: KenoBigSmallBet | KenoEvenOddBet;

  /** Số lần cược nhân bội (≥ minBetCount). Snapshot từ ticket board. */
  betCount: number;
}

/**
 * Chi tiết payout 1 board — cả cơ bản và bổ sung.
 *
 * - Cơ bản (pick1-pick10): dùng matchCount + pickCount + isWin, outcome = undefined.
 * - Bổ sung (bigSmall/evenOdd): dùng outcome + isWin, matchCount = null, pickCount = null.
 */
export interface EntryBoardPayout {
  /** Mã board: "A", "B", "C". */
  boardNo: string;

  /** Loại chơi: "pick1"–"pick10" hoặc "bigSmall"/"evenOdd". */
  playType: KenoPlayType;

  /**
   * Số trùng với kết quả quay. Chỉ meaningful cho cơ bản (pick1-pick10).
   * Bổ sung (bigSmall/evenOdd): null — field không áp dụng.
   *
   * LƯU Ý: pick8/9/10 trùng 0 số = giải an ủi 10.000đ → 0 là giá trị hợp lệ.
   */
  matchCount: number | null;

  /**
   * Số lượng số người chơi đã chọn (= numbers.length). Chỉ meaningful cho cơ bản.
   * Bổ sung (bigSmall/evenOdd): null — field không áp dụng.
   */
  pickCount: number | null;

  /**
   * Lựa chọn cụ thể player đặt. Chỉ cho bổ sung (bigSmall/evenOdd).
   * Cơ bản: undefined.
   */
  bet?: KenoBigSmallBet | KenoEvenOddBet;

  /**
   * Kết quả draw đối với bet này: "big13Plus", "draw", "even1314"...
   * Chỉ cho bổ sung (bigSmall/evenOdd). Cơ bản: undefined.
   *
   * LƯU Ý: `outcome` mô tả trạng thái draw, KHÔNG phải player win/lose.
   */
  outcome?: string;

  /**
   * Kết quả matching: player thắng hay thua board này.
   * Set cho TẤT CẢ play types — cơ bản lẫn bổ sung.
   *
   * **Lý do tồn tại (denormalized flag):**
   * Keno/Bingo18 không có `TicketLineDoc` riêng như các lottery game — kết quả per-board
   * chỉ được lưu tại đây. Mỗi play type có logic xác định thắng/thua khác nhau:
   *  - pick1-pick10: `matchCount >= threshold[pickCount]` (tra prize table)
   *  - bigSmall:     `bet === outcome`
   *  - evenOdd:      `bet === outcome`
   * `isWin` normalize tất cả thành 1 boolean duy nhất tại thời điểm settle, giúp
   * downstream consumers (SDK, backoffice, feed, reports) không cần tự implement
   * lại matching logic per play type.
   *
   * Invariant: isWin = true ↔ winAmount > 0.
   */
  isWin: boolean;

  /** Số lần cược nhân bội. Giải thích tại sao winAmount > giá trị 1 unit. */
  betCount: number;

  /** Tiền thắng thực tế = unitWinAmount × betCount (VND). 0 nếu không trúng. */
  winAmount: number;
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
