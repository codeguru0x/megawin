/**
 * Bingo 18 – Ticket Entry Document
 *
 * Collection: bingo18_ticket_entries
 *
 * 1 document = 1 ticket tham gia 1 kỳ quay Bingo 18 cụ thể.
 * Đơn vị vận hành chính cho settle + report.
 */

import type { EntryOutcome, EntryStatus } from "@megawin/game-core/entities";
import type { Long } from "@megawin/game-core/types";

import type { Bingo18BigSmallBet, Bingo18PlayType, Bingo18TripleKind } from "./enums";
import type { ISODateString } from "./types";

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Thông tin hoa hồng đại lý, snapshot tại thời điểm tạo entry. */
export interface EntryTenantSnapshot {
  /** Tỷ lệ hoa hồng snapshot tại thời điểm tạo entry. Lấy từ tenant config. */
  commissionRate: number;
  /** Số tiền hoa hồng = amount × commissionRate. Tính sẵn để dùng trong settle. */
  commissionAmount: number;
}

/** Tóm tắt nội dung cược, snapshot từ ticket. boards[] chứa cả cơ bản và bổ sung. */
export interface EntrySummary {
  /** Mã vé (display), format do hệ thống sinh. */
  ticketNo: string;
  /** Danh sách boards — cả cơ bản (singleNum, doubleMatch, tripleMatch) và bổ sung (sumTotal, bigSmallDraw). */
  boards: EntryBoardSnapshot[];
}

/**
 * Snapshot kết quả kỳ quay. Copy từ draw khi settle.
 * Giữ local để truy vấn entry không cần join draw.
 */
export interface EntryResult {
  /** 3 số kết quả quay (giữ nguyên thứ tự). */
  numbers: number[];
  /** Tổng 3 số quay (3-18). */
  sum: number;
  /** Thời điểm công bố kết quả. */
  publishedAt: Date;
}

/** Chi tiết thanh toán. Set sau khi settle tính xong thắng/thua. */
export interface EntryPayout {
  /** Tổng tiền thắng = Σ(boardPayouts.winAmount). */
  winAmount: number;
  /** Tiền trả cho player = winAmount (Bingo 18 không có payout cap). */
  payoutAmount: number;
  /** Chi tiết payout từng board (cả cơ bản và bổ sung). */
  boardPayouts: EntryBoardPayout[];
  /** Thời điểm settle hoàn tất (tính toán xong thắng/thua). */
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
 * Thông tin void + refund. Set khi kỳ quay bị huỷ.
 * Toàn bộ tiền cược được hoàn 100%.
 *
 * Trạng thái dispatch refund (pending/dispatched/failed) lưu tại
 * `tenant_dispatch_orders` — KHÔNG còn lưu trên entry. `refundTx` giữ lại
 * làm idempotency seed khi enqueue dispatch.
 */
export interface EntryVoidInfo {
  /** Tiền cược gốc trước void = entry.amount. */
  originalAmount: number;
  /** Tiền hoàn trả = originalAmount (hoàn 100%). */
  refundAmount: number;
  /** Thời điểm entry bị void. */
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
  /** MongoDB document ID. */
  _id: unknown;

  // ───── Partition / Ownership ─────

  /** ID đại lý sở hữu entry. Dùng để phân vùng dữ liệu multi-tenant. */
  tenantId: string;
  /** ID tài khoản player đặt cược. */
  accountId: string;
  /** Tên đăng nhập player, snapshot tại thời điểm tạo entry. */
  username: string;
  /**
   * IP address của player lúc đặt cược (IPv4 hoặc IPv6).
   * Snapshot từ ticket, lưu để audit trail.
   */
  ipAddress?: string;

  /** Reference đến ticket gốc. Lưu dạng hex string (ObjectId.toHexString()). */
  ticketId: string;

  // ───── Draw Snapshot ─────

  /** ID kỳ quay mà entry tham gia. Format: "YYYY-MM-DD.NNN". */
  drawId: string;
  /** Ngày tài chính của kỳ quay. Snapshot từ draw, dùng cho báo cáo. */
  financialDate: ISODateString;

  // ───── Tenant ─────

  /** Thông tin hoa hồng đại lý, snapshot tại thời điểm tạo entry. */
  tenant: EntryTenantSnapshot;

  // ───── Entry Status ─────

  /**
   * Trạng thái entry.
   * Luồng: pending → settled (nếu draw published) hoặc pending → voided (nếu draw void).
   */
  status: EntryStatus;

  // ───── Stake ─────

  /** Số lượng cược (selections) = boards.length. Đếm số bets logic, KHÔNG tính multiplier. */
  selectionCount: number;
  /** Tổng đơn vị cược thực tế = Σ(board.betCount). Dùng tính tiền: amount = betUnitCount × unitPrice. */
  betUnitCount: number;
  /** Tổng tiền cược (VND) = betUnitCount × unitPrice. Trừ từ ví player khi tạo entry. */
  amount: number;
  /** Mệnh giá 1 lần tham gia dự thưởng (VND). Snapshot từ global config (mặc định 10.000đ). */
  unitPrice: number;

  // ───── Entry Summary ─────

  /** Tóm tắt nội dung cược, snapshot từ ticket. Dùng để hiển thị + settle. */
  entrySummary: EntrySummary;

  // ───── Result Snapshot ─────

  /**
   * Snapshot kết quả kỳ quay. Copy từ draw khi settle.
   * Giữ local để truy vấn entry không cần join draw.
   */
  result?: EntryResult;

  // ───── Outcome ─────

  /** Kết quả tổng hợp: "win" | "loss" | "void" (kỳ quay bị huỷ). Set sau settle. */
  outcome?: EntryOutcome;

  // ───── Payout ─────

  /** Chi tiết thanh toán. Set sau khi settle tính xong thắng/thua. */
  payout?: EntryPayout;

  // ───── Void / Refund ─────

  /**
   * Thông tin void + refund. Set khi kỳ quay bị huỷ.
   * Toàn bộ tiền cược được hoàn 100%.
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

  /** Thời điểm tạo entry. Set 1 lần khi ticket được place bet, không đổi. */
  createdAt: Date;
  /** Thời điểm cập nhật cuối cùng. Tự động cập nhật mỗi khi document thay đổi. */
  updatedAt: Date;
  /** Optimistic concurrency version. Tăng +1 mỗi lần update, dùng chống race condition. */
  version: Long;
}

// ─────────────────────────────────────────────
// Sub-types
// ─────────────────────────────────────────────

/**
 * Snapshot 1 board từ ticket — cả cơ bản và bổ sung.
 *
 * - singleNum / doubleMatch: boardNo + playType + number.
 * - tripleMatch: boardNo + playType + tripleKind + number (nếu specific).
 * - sumTotal: boardNo + playType + sum.
 * - bigSmallDraw: boardNo + playType + bet.
 */
export interface EntryBoardSnapshot {
  /** Mã board: "A"–"F". Unique trong 1 ticket. */
  boardNo: string;
  /** Loại cược: "singleNum" | "doubleMatch" | "tripleMatch" | "sumTotal" | "bigSmallDraw". */
  playType: Bingo18PlayType;
  /** Số đã chọn (1-6). Dùng cho singleNum, doubleMatch, tripleMatch specific. */
  number?: number;
  /** Phân loại triple: "specific" | "any". Chỉ dùng cho tripleMatch. */
  tripleKind?: Bingo18TripleKind;
  /** Tổng cụ thể đã chọn (3-18). Chỉ dùng cho sumTotal. */
  sum?: number;
  /** Cược lớn/hoà/nhỏ: "big" | "draw" | "small". Chỉ dùng cho bigSmallDraw. */
  bet?: Bingo18BigSmallBet;
  /** Số lần tham gia dự thưởng. Snapshot từ ticket board lúc place-bet. */
  betCount: number;
}

/**
 * Kết quả payout 1 board — cả cơ bản và bổ sung.
 *
 * - Cơ bản (singleNum/doubleMatch/tripleMatch): dùng matchCount + isWin, outcome = undefined.
 * - Bổ sung (sumTotal/bigSmallDraw): dùng outcome + isWin, matchCount = null.
 */
export interface EntryBoardPayout {
  /** Mã board tương ứng trong entrySummary.boards. */
  boardNo: string;
  /** Loại cược của board. */
  playType: Bingo18PlayType;
  /**
   * Phân loại triple: "specific" (1.200.000đ) hoặc "any" (200.000đ).
   * Chỉ set cho tripleMatch — undefined cho các loại khác.
   */
  tripleKind?: Bingo18TripleKind;
  /**
   * Số lần số đã chọn xuất hiện trong kết quả (0-3). Meaningful cho cơ bản.
   * Bổ sung (sumTotal/bigSmallDraw): null — field không áp dụng.
   */
  matchCount: number | null;
  /**
   * Tổng đã chọn (3-18). Chỉ set cho sumTotal.
   * Undefined cho các loại khác.
   */
  sum?: number;
  /**
   * Cược lớn/hoà/nhỏ. Chỉ set cho bigSmallDraw.
   * Undefined cho các loại khác.
   */
  bet?: Bingo18BigSmallBet;
  /**
   * Kết quả thực tế của kỳ quay — encode theo playType:
   * - sumTotal: giá trị tổng 3 số dưới dạng string, ví dụ "9", "14".
   * - bigSmallDraw: "big" | "small" | "draw" tương ứng với tổng >= 12, <= 9, 10-11.
   *
   * Chỉ set cho bổ sung (sumTotal/bigSmallDraw). Cơ bản: undefined.
   * KHÔNG dùng field này để xác định thắng/thua — dùng `isWin`.
   */
  outcome?: string;
  /**
   * Kết quả matching: player thắng hay thua board này.
   * Set cho TẤT CẢ play types — cơ bản lẫn bổ sung.
   *
   * **Lý do tồn tại (denormalized flag):**
   * Keno/Bingo18 không có `TicketLineDoc` riêng như các lottery game — kết quả per-board
   * chỉ được lưu tại đây. Mỗi play type có logic xác định thắng/thua khác nhau:
   *  - singleNum:    `matchCount > 0`
   *  - doubleMatch:  `matchCount >= 2`
   *  - tripleMatch:  `matchCount === 3`
   *  - sumTotal:     `sum === tổng 3 mặt xúc xắc`
   *  - bigSmallDraw: `bet === outcome`
   * `isWin` normalize tất cả thành 1 boolean duy nhất tại thời điểm settle, giúp
   * downstream consumers (SDK, backoffice, feed, reports) không cần tự implement
   * lại matching logic per play type.
   *
   * `true` = player thắng (winAmount > 0). `false` = player thua.
   */
  isWin: boolean;
  /** Số lần tham gia dự thưởng. Snapshot từ board. winAmount = unitWinAmount × betCount. */
  betCount: number;
  /** Giá trị giải per-unit (VND) trước khi nhân betCount. = 0 nếu thua. */
  unitWinAmount: number;
  /** Tiền thắng thực tế (VND) = giá trị giải per-unit × betCount. Đã nhân multiplier. */
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
