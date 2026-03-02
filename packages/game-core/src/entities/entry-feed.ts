/**
 * Game Core – Entry Feed Document
 *
 * Collection: entryFeed
 *
 * Unified collection chứa bản copy đơn cược từ TẤT CẢ game.
 * Mỗi khi entry thay đổi (tạo mới, chuyển status, settle, void), worker của game đó
 * sẽ upsert snapshot mới nhất vào collection này (key = sourceEntryId).
 * Mỗi entry gốc chỉ có DUY NHẤT 1 document, version cập nhật mỗi lần thay đổi.
 *
 * Tenant poll qua API: GET /tenant/entries/feed?afterVersion={n}&limit={m}
 * để nhận các thay đổi mới, build báo cáo:
 *   - Tiền đang chờ quay (status = active)
 *   - Tiền thắng thua (status = settled + payout)
 *   - Doanh thu realtime
 *
 * THIẾT KẾ:
 * - version (Long/Int64): lấy từ entry gốc, gốc gán từ global entryChangeSeq.
 * - Mỗi entry gốc = 1 document duy nhất. Upsert chỉ ghi nếu version mới > cũ.
 * - Tenant dùng version làm cursor, không dùng offset/page.
 * - Worker chạy theo scheduler (Lambda), mỗi game 1 worker riêng.
 *
 * FINANCIAL FIELDS (đồng nhất cho tất cả game):
 * - stakeAmount:  tiền cược kỳ này
 * - winAmount:    tiền thắng (0 nếu chưa settle hoặc không trúng)
 * - payoutAmount: tiền trả thưởng thực tế cho khách (sau thuế/phí nếu có)
 * - netAmount:    stakeAmount - payoutAmount (dương = house win, âm = house loss)
 *
 * LONG / BIGINT SERIALIZATION:
 * - Trong MongoDB: field `version` lưu dạng BSON Long (Int64).
 * - Trong Entity (application layer): `version` là string (Long.toString()).
 * - Trong API response (JSON): `version` là string.
 * - Lý do: JSON không hỗ trợ BigInt, JS Number safe chỉ đến 2^53.
 */

import type { Long } from "mongodb";
import type { EntryStatus, GameProduct } from "./game-core.enums";

// ─────────────────────────────────────────────
// MongoDB Document (lưu trong DB)
// ─────────────────────────────────────────────

/**
 * Document lưu trong MongoDB collection `entryFeed`.
 *
 * Mỗi document là snapshot trạng thái MỚI NHẤT của 1 đơn cược.
 * Upsert key = sourceEntryId. Chỉ ghi đè khi version mới > version cũ.
 * Unique index trên sourceEntryId đảm bảo 1 document per entry gốc.
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
  sourceEntryId: string;

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
  playerId: string;

  // ───── Draw Info ─────

  /**
   * ID kỳ quay mà đơn cược tham gia.
   * Ví dụ: "2026-02-23-001".
   * Dùng để nhóm entries theo kỳ quay khi làm report.
   */
  drawId: string;

  /**
   * Thời điểm quay số (UTC).
   * Dùng để sort timeline, filter theo khoảng thời gian.
   */
  drawTime: Date;

  /**
   * Ngày quay theo timezone vận hành, format "YYYY-MM-DD".
   * Ví dụ: "2026-02-23" (Asia/Ho_Chi_Minh).
   * Dùng cho group aggregation report hàng ngày.
   */
  drawDate: string;

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
   * Lợi nhuận ròng = stakeAmount - payoutAmount (VND).
   * > 0: house win (khách thua hoặc không trúng).
   * < 0: house loss (khách trúng lớn hơn tiền cược).
   * = stakeAmount khi chưa settle (payoutAmount = 0).
   * Tenant dùng để tính GGR (Gross Gaming Revenue).
   */
  netAmount: number;

  // ───── Timestamps ─────

  /**
   * Thời điểm entry gốc (trong collection riêng của game) được cập nhật.
   * Phản ánh lúc entry thực sự thay đổi trạng thái.
   */
  sourceUpdatedAt: Date;

  /**
   * Thời điểm worker ghi bản copy này vào feed.
   * Có thể trễ hơn sourceUpdatedAt do scheduler interval.
   * Tenant không nên dùng field này để sort – dùng `version` thay thế.
   */
  feedCreatedAt: Date;
}

// ─────────────────────────────────────────────
// Entity (application layer – version đã là string)
// ─────────────────────────────────────────────

/**
 * Entity layer của EntryFeed.
 *
 * Giống EntryFeedDoc nhưng:
 * - `_id` → `id` (string, ObjectId hex).
 * - `version` → string (Long.toString()) – safe cho JSON serialize.
 *
 * Dùng trong use case, service, handler. Có thể truyền thẳng vào
 * JSON response mà không lo lỗi BigInt serialization.
 */
export interface EntryFeedEntity {
  /** ObjectId hex string, map từ _id. */
  id: string;

  /**
   * Version đã convert từ Long → string.
   * Ví dụ: "1042" thay vì Long(1042).
   * Tenant lưu giá trị này làm cursor cho lần poll tiếp.
   */
  version: string;

  /** Mã game: "lotto535" | "keno" | "max3d". */
  gameProduct: GameProduct;

  /** ID entry gốc trong collection riêng của game. */
  sourceEntryId: string;
  /** ID ticket gốc. */
  ticketId: string;
  /** Mã vé hiển thị. */
  ticketNo: string;

  /** ID tenant sở hữu. */
  tenantId: string;
  /** ID người chơi. */
  playerId: string;

  /** ID kỳ quay. */
  drawId: string;
  /** Thời điểm quay (UTC). */
  drawTime: Date;
  /** Ngày quay "YYYY-MM-DD". */
  drawDate: string;

  /** Trạng thái đồng nhất. */
  status: EntryStatus;

  /** Tiền cược (VND). */
  stakeAmount: number;
  /** Tiền thắng gross (VND). 0 nếu chưa settle. */
  winAmount: number;
  /** Tiền trả thực cho khách (VND). 0 nếu chưa settle. */
  payoutAmount: number;
  /** Lợi nhuận ròng = stake - payout (VND). */
  netAmount: number;

  /** Thời điểm entry gốc thay đổi. */
  sourceUpdatedAt: Date;
  /** Thời điểm worker ghi vào feed. */
  feedCreatedAt: Date;
}

// ─────────────────────────────────────────────
// API Types (cho tenant response)
// ─────────────────────────────────────────────

/**
 * Query params tenant gửi lên khi poll entry feed.
 */
export interface EntryFeedQuery {
  /**
   * Tenant ID – inject tự động từ auth middleware (API Key).
   * Tenant không cần gửi, hệ thống tự lấy từ token.
   */
  tenantId: string;

  /**
   * Poll từ version này trở đi (exclusive).
   * Lần đầu gửi "0" để lấy từ đầu.
   * Các lần tiếp theo: gửi `lastVersion` từ response trước.
   */
  afterVersion: string;

  /**
   * Số record tối đa trả về mỗi lần poll.
   * Default: 100. Max: 500.
   * Nếu `hasMore = true`, tenant nên poll tiếp ngay.
   */
  limit?: number;

  /**
   * Lọc theo game cụ thể (optional).
   * Không gửi = lấy tất cả game.
   * Ví dụ: "lotto535" chỉ lấy feed của Lotto 5/35.
   */
  gameProduct?: GameProduct;
}

/**
 * API response trả về cho tenant khi poll entry feed.
 */
export interface EntryFeedResponse {
  /** Danh sách entries thay đổi, sorted by version ASC. */
  items: EntryFeedItem[];

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
 * 1 item trong API response – serialized từ EntryFeedEntity.
 *
 * Tất cả Date chuyển thành ISO 8601 string, Long chuyển thành string,
 * để JSON serialize an toàn qua HTTP.
 * tenantId không trả về vì tenant đã biết ID của mình.
 */
export interface EntryFeedItem {
  /** Version (string từ Long). Cursor chính. */
  version: string;

  /** Mã game: "lotto535" | "keno" | "max3d". */
  gameProduct: GameProduct;

  /**
   * ID entry gốc – tenant dùng làm business key để dedup.
   * Khi cùng 1 sourceEntryId xuất hiện nhiều lần, giữ version cao nhất.
   */
  sourceEntryId: string;

  /** ID ticket gốc chứa đơn cược. */
  ticketId: string;

  /** Mã vé hiển thị (human-readable). */
  ticketNo: string;

  /** ID người chơi. */
  playerId: string;

  /** ID kỳ quay. */
  drawId: string;

  /** Thời điểm quay (ISO 8601 string, UTC). */
  drawTime: string;

  /** Ngày quay "YYYY-MM-DD" (theo timezone vận hành). */
  drawDate: string;

  /**
   * Trạng thái đơn cược:
   * "scheduled" | "settled" | "void".
   */
  status: EntryStatus;

  /** Tiền cược kỳ này (VND). */
  stakeAmount: number;

  /** Tổng tiền thắng gross (VND). 0 nếu chưa settle hoặc không trúng. */
  winAmount: number;

  /** Tiền trả thực cho khách (VND). 0 nếu chưa settle. */
  payoutAmount: number;

  /** Lợi nhuận ròng = stake - payout (VND). Dương = house win. */
  netAmount: number;

  /** Thời điểm entry gốc thay đổi (ISO 8601 string, UTC). */
  sourceUpdatedAt: string;

  /** Thời điểm worker ghi vào feed (ISO 8601 string, UTC). */
  feedCreatedAt: string;
}
