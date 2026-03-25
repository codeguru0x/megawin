/**
 * Game Core – Entry Feed Document
 *
 * Collection: entryFeed
 *
 * Unified collection chứa bản copy đơn cược từ TẤT CẢ game.
 * Mỗi khi entry thay đổi (tạo mới, chuyển status, settle, void), worker của game đó
 * sẽ upsert snapshot mới nhất vào collection này (key = entryId).
 * Mỗi entry gốc chỉ có DUY NHẤT 1 document, version cập nhật mỗi lần thay đổi.
 *
 * Tenant poll qua API: GET /tenant/bets/feed?afterVersion={n}&limit={m}
 * để nhận các thay đổi mới, build báo cáo:
 *   - Đơn đang chờ quay (status = scheduled)
 *   - Đơn đã settle (status = settled + payout)
 *   - Đơn bị huỷ (status = void + voidInfo)
 *
 * THIẾT KẾ:
 * - version (Long/Int64): lấy từ entry gốc, gốc gán từ global entryChangeSeq.
 * - Mỗi entry gốc = 1 document duy nhất. Upsert chỉ ghi nếu version mới > cũ.
 * - Tenant dùng version làm cursor, không dùng offset/page.
 * - Worker chạy theo scheduler (Lambda), mỗi game 1 worker riêng.
 *
 * FINANCIAL FIELDS (đồng nhất cho tất cả game):
 * - stakeAmount:      tiền cược kỳ này
 * - winAmount:        tiền thắng (0 nếu chưa settle hoặc không trúng)
 * - payoutAmount:     tiền trả thưởng thực tế cho khách (sau thuế/phí nếu có)
 * - ggr:              Gross Gaming Revenue = stakeAmount - payoutAmount
 * - commissionRate:   tỷ lệ hoa hồng snapshot lúc place-bet
 * - commissionAmount: tiền hoa hồng = stakeAmount × commissionRate
 *
 * GAME-SPECIFIC FIELDS (unknown – game tự định nghĩa type trong feed-types.ts):
 * - betContent:    nội dung cược (boards, numbers...) tuỳ game
 * - drawResult:    kết quả kỳ quay (có sau khi publish result)
 * - payoutDetail:  chi tiết từng hạng giải (có sau khi settle)
 *
 * LONG / BIGINT SERIALIZATION:
 * - Trong MongoDB: field `version` lưu dạng BSON Long (Int64).
 * - Trong Entity (application layer): `version` là string (Long.toString()).
 * - Trong API response (JSON): `version` là string.
 * - Lý do: JSON không hỗ trợ BigInt, JS Number safe chỉ đến 2^53.
 */

import type { Long } from "mongodb";
import type { EntryOutcome, EntryStatus, GameProduct } from "./game-core.enums";

// ─────────────────────────────────────────────
// Embedded Types
// ─────────────────────────────────────────────

/**
 * Thông tin huỷ cược trong feed.
 * Snapshot từ entry.voidInfo khi entry bị void.
 */
export interface FeedVoidInfo {
  /** Tiền cược gốc trước khi huỷ (VND). */
  originalAmount: number;

  /** Tiền hoàn trả cho player (VND). */
  refundAmount: number;

  /** Thời điểm entry bị huỷ. */
  voidedAt: Date;
}

// ─────────────────────────────────────────────
// MongoDB Document (lưu trong DB)
// ─────────────────────────────────────────────

/**
 * Document lưu trong MongoDB collection `entryFeed`.
 *
 * Mỗi document là snapshot trạng thái MỚI NHẤT của 1 đơn cược.
 * Upsert key = entryId. Chỉ ghi đè khi version mới > version cũ.
 * Unique index trên entryId đảm bảo 1 document per entry gốc.
 */
export interface EntryFeedDoc {
  /** MongoDB ObjectId – tự sinh, không mang ý nghĩa business. */
  _id: unknown;

  // ───── Ordering / Cursor ─────

  /**
   * Số thứ tự thay đổi, tăng dần toàn hệ thống (BSON Long / Int64).
   * Allocate từ collection `entryChangeSeq` (global singleton).
   * Tenant dùng field này làm cursor khi poll: `version > lastKnownVersion`.
   * Unique index: đảm bảo không trùng, query range scan hiệu quả.
   */
  version: Long;

  // ───── Game Identification ─────

  /**
   * Mã game phát sinh đơn cược này.
   * Ví dụ: "lotto535", "keno", "max3d".
   * Tenant dùng để filter feed theo game cụ thể nếu cần.
   */
  gameProduct: GameProduct;

  // ───── Entry Reference ─────

  /**
   * ID gốc của entry trong collection riêng của game
   * (vd: ObjectId trong `lotto535TicketEntries` hoặc `kenoTicketEntries`).
   * Tenant dùng field này để dedup: khi nhận nhiều version của cùng 1 entry,
   * chỉ giữ version cao nhất.
   */
  entryId: string;

  /**
   * ID ticket gốc chứa đơn cược này.
   * 1 ticket có thể sinh ra nhiều entries (multi-draw).
   * Dùng để nhóm các entries thuộc cùng 1 vé.
   */
  ticketId: string;

  /**
   * Mã vé hiển thị cho người chơi (human-readable).
   * Ví dụ: "L535-20260223-00042".
   * Tenant dùng để đối soát, hiển thị trên giao diện.
   */
  ticketNo: string;

  // ───── Partition / Ownership ─────

  /**
   * ID tenant/đại lý sở hữu đơn cược.
   * API filter bắt buộc: tenant chỉ thấy feed của mình.
   * Compound index: { tenantId, version } cho query hiệu quả.
   */
  tenantId: string;

  /**
   * ID người chơi đặt cược.
   * Tenant dùng để xem lịch sử cược theo player.
   */
  accountId: string;

  // ───── Draw Info ─────

  /**
   * ID kỳ quay mà đơn cược tham gia.
   * Ví dụ: "2026-02-23-001".
   * Dùng để nhóm entries theo kỳ quay khi làm report.
   */
  drawId: string;

  // ───── Status ─────

  /**
   * Trạng thái đồng nhất của đơn cược (EntryStatus).
   * Tenant dựa vào field này để phân loại:
   *   - "scheduled": tiền đang chờ quay (pending stake)
   *   - "settled": đã tính xong, xem winAmount/payoutAmount
   *   - "void": đơn vô hiệu, không tính vào report
   */
  status: EntryStatus;

  // ───── Financials ─────

  /** Tổng đơn vị cược thực tế. Dùng tính tiền: amount = betUnitCount × unitPrice. */
  betUnitCount: number;

  /** Mệnh giá 1 lần tham gia dự thưởng (VND). Snapshot từ global config (mặc định 10.000đ). */
  unitPrice: number;

  /**
   * Tiền cược kỳ này (VND).
   * = lineCount × unitPrice (Lotto535) hoặc betCount × unitPrice (Keno).
   * Luôn > 0. Không thay đổi sau khi đơn được tạo.
   */
  stakeAmount: number;

  /**
   * Tổng tiền thắng (tổng giải thưởng, VND).
   * = 0 khi chưa settle hoặc không trúng.
   * > 0 khi trúng thưởng và đã settle.
   * Đây là tiền thưởng gross (trước thuế/phí).
   */
  winAmount: number;

  /**
   * Tiền trả thưởng thực tế cho khách (VND).
   * = winAmount nếu không có thuế/phí.
   * = winAmount - tax nếu có thuế.
   * = 0 khi chưa settle hoặc không trúng.
   * Đây là số tiền khách thực nhận.
   */
  payoutAmount: number;

  /**
   * Gross Gaming Revenue = stakeAmount - payoutAmount (VND).
   * > 0: house win (khách thua hoặc không trúng).
   * < 0: house loss (khách trúng lớn hơn tiền cược).
   * = stakeAmount khi chưa settle (payoutAmount = 0).
   * Tenant dùng để tính doanh thu thuần từng kỳ quay / ngày.
   */
  ggr: number;

  // ───── Commission (snapshot lúc place-bet) ─────

  /**
   * Tỷ lệ hoa hồng đại lý áp dụng cho đơn cược này.
   * Snapshot từ TenantConfig lúc place-bet, không thay đổi sau đó.
   * Ví dụ: 0.20 = 20%.
   */
  commissionRate: number;

  /**
   * Tiền hoa hồng đại lý (VND).
   * Công thức: Math.round(stakeAmount × commissionRate). Tính sẵn lúc place-bet.
   */
  commissionAmount: number;

  // ───── Player Info ─────

  /**
   * Tên tài khoản người chơi của đối tác (tenant username).
   * Tên này đã loại bỏ suffix @tenantId.
   * Tenant dùng để hiển thị lịch sử cược, báo cáo theo player.
   */
  username: string;

  /**
   * Ngày tài chính mà đơn cược này thuộc về, format "YYYY-MM-DD".
   * Có thể khác drawDate: theo business rule ngày tài chính tính từ 11h sáng.
   * Tenant dùng để group báo cáo tài chính hàng ngày.
   */
  financialDate: string;

  /**
   * Kết quả đơn cược sau khi settle.
   * "win" | "lose" — chỉ có sau khi settle.
   * undefined khi status = "scheduled" hoặc "void".
   */
  outcome?: EntryOutcome;

  // ───── Void Info ─────

  /**
   * Thông tin huỷ cược + hoàn tiền.
   * Chỉ có khi status = "void".
   */
  voidInfo?: FeedVoidInfo;

  // ───── Game-Specific Content (unknown – type-safe tại mapper layer) ─────

  /**
   * Nội dung cược tuỳ game: boards, numbers, playType...
   * Kiểu thực tế được định nghĩa trong packages/game-{game}/src/entities/feed-types.ts.
   * Luôn có giá trị (set lúc place-bet).
   *
   * Ví dụ: Lotto535FeedBetContent, KenoBetContent, Max3dBetContent...
   */
  betContent: unknown;

  /**
   * Kết quả kỳ quay tuỳ game: winning numbers, triplets...
   * Chỉ có sau khi draw result được publish.
   *
   * Ví dụ: Lotto535FeedDrawResult, KenoFeedDrawResult...
   */
  drawResult?: unknown;

  /**
   * Chi tiết trả thưởng tuỳ game: danh sách tiers, board payouts...
   * Chỉ có sau khi settle và outcome = "win".
   *
   * Ví dụ: Lotto535FeedPayoutDetail, KenoFeedPayoutDetail...
   */
  payoutDetail?: unknown;

  // ───── Timestamps ─────

  /** Thời điểm tạo document. */
  createdAt: Date;

  /**
   * Thời điểm document được cập nhật.
   * Phản ánh lúc entry thực sự thay đổi trạng thái.
   */
  updatedAt: Date;

  /**
   * Thời điểm worker ghi bản copy này vào feed (internal).
   * Dùng để monitor độ trễ sync: updatedAt → feedCreatedAt.
   * Tenant không cần field này — không trả về trong BetsFeedItem.
   */
  feedCreatedAt: Date;
}

// ─────────────────────────────────────────────
// Entity (application layer – version đã là string)
// ─────────────────────────────────────────────

/**
 * Entity layer của EntryFeed.
 *
 * Kế thừa EntryFeedDoc, override 2 field:
 * - `_id` → `id` (string, ObjectId hex).
 * - `version` → string (Long.toString()) – safe cho JSON serialize.
 *
 * Dùng trong use case, service, handler. Có thể truyền thẳng vào
 * JSON response mà không lo lỗi BigInt serialization.
 */
export interface EntryFeedEntity extends Omit<EntryFeedDoc, "_id" | "version"> {
  /** ObjectId hex string, map từ _id. */
  id: string;
  /**
   * Version đã convert từ Long → string.
   * Ví dụ: "1042" thay vì Long(1042).
   * Tenant lưu giá trị này làm cursor cho lần poll tiếp.
   */
  version: string;
}

// ─────────────────────────────────────────────
// API Types (cho tenant response)
// ─────────────────────────────────────────────

/**
 * API response trả về cho tenant khi poll bets feed.
 */
export interface BetsFeedResponse {
  /** Danh sách đơn cược thay đổi, sorted by version ASC. */
  items: BetsFeedItem[];

  /**
   * Version lớn nhất trong batch.
   * Tenant lưu giá trị này → gửi lại làm `afterVersion` lần poll tiếp.
   * Nếu items rỗng, trả lại `afterVersion` gốc.
   */
  lastVersion: string;

  /**
   * Còn data chưa trả hết.
   * true: tenant nên poll tiếp ngay (không cần chờ interval).
   * false: đã hết data mới, tenant chờ interval rồi poll lại.
   */
  hasMore: boolean;
}

/**
 * 1 item trong bets feed API response.
 *
 * Là EntryFeedEntity bỏ `id` (internal, tenant không cần), `tenantId`
 * (tenant đã biết qua auth), và `feedCreatedAt` (internal monitoring,
 * không có giá trị với tenant). Tất cả field còn lại giữ nguyên —
 * Date serialize tự động thành ISO 8601 string khi JSON.stringify.
 */
export type BetsFeedItem = Omit<EntryFeedEntity, "id" | "tenantId" | "feedCreatedAt">;
