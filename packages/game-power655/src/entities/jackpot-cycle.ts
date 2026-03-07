/**
 * Power 6/55 – Jackpot Cycle Entity (Chu kỳ Jackpot)
 *
 * Power 6/55 có 2 jackpot tích luỹ chạy SONG SONG:
 *   - Jackpot 1: giải trùng 6/6 số chính (tối thiểu 30 tỷ)
 *   - Jackpot 2: giải trùng 5/6 + bonus number (tối thiểu 3 tỷ)
 *
 * Chu kỳ (cycle) theo dõi tích luỹ từ seed → winner/split:
 *   1. Tạo cycle mới với seed amounts (JP1: 30 tỷ, JP2: 3 tỷ)
 *   2. Mỗi kỳ quay: cộng contribution (90% cho JP1, 10% cho JP2)
 *   3. Overflow: khi JP1 > 300 tỷ → phần vượt chuyển JP2
 *   4. Cycle kết thúc khi: có winner JP1/JP2, hoặc split threshold
 *   5. Tạo cycle mới với seed amounts
 *
 * 1 cycle active tại 1 thời điểm. Cycles đã closed lưu lịch sử.
 * Collection: power655JackpotCycles.
 */

/**
 * Lý do đóng chu kỳ jackpot.
 * Dùng cho audit và hiển thị lịch sử.
 */
export type JackpotCycleClosedReason =
  | "jackpot1_winner" // Có người trúng JP1 (trùng 6/6)
  | "jackpot2_winner" // Có người trúng JP2 (trùng 5/6 + bonus)
  | "both_winner" // Cả JP1 và JP2 đều có winner trong cùng kỳ
  | "split"; // Tổng JP vượt splitThreshold → chia cho các giải cố định

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/** Thông tin người trúng Jackpot. */
export interface JackpotWinnerInfo {
  /** ID tài khoản người chơi. */
  accountId: string;
  /** Username hiển thị. */
  username?: string;
  /** ID tenant / đại lý. */
  tenantId: string;
  /** Tên tenant (snapshot). */
  tenantName?: string;
  /** Số tiền trúng (VND). */
  prizeAmount: number;
  /** ID entry trúng giải. */
  entryId: string;
  /** ID draw trúng giải. */
  drawId: string;
  /** Jackpot nào trúng: "jp1" hoặc "jp2". */
  jackpotType: "jp1" | "jp2";
}

/** Phân bổ tiền thưởng cho 1 tier trong kỳ chia. */
export interface SplitTierAllocation {
  /** Số lượng giải trúng trong tier này. */
  winnerCount: number;
  /** Bonus mỗi giải trúng = totalAmount / winnerCount (đã làm tròn). */
  bonusPerWinner: number;
  /** Tổng tiền phân bổ cho tier. */
  totalAmount: number;
}

/** Chi tiết chia giải khi closedReason = split. */
export interface JackpotSplitDetail {
  /** Tổng giá trị Jackpot được chia (VND). */
  splitAmount: number;
  /**
   * Phân bổ chia cho từng tier. Key = tier name.
   * Chỉ chứa tier có người trúng.
   */
  tierAllocations: Record<string, SplitTierAllocation>;
  /** Tổng số người trúng giải (across all tiers) trong kỳ chia. */
  totalWinners: number;
  /** Tổng tiền bonus đã chi trả thực tế (VND). */
  totalPaid: number;
}

/**
 * MongoDB document cho chu kỳ Jackpot.
 */
export interface JackpotCycleDoc {
  /** MongoDB ObjectId – khóa chính nội bộ. Không dùng trong business logic. */
  _id: unknown;
  /** Số thứ tự cycle (tăng dần, unique). Dùng cho hiển thị lịch sử. */
  cycleNo: number;
  /** Trạng thái: "active" (đang tích luỹ) hoặc "closed" (đã kết thúc). */
  status: "active" | "closed";

  /** Giá trị JP1 khi bắt đầu cycle (= seedAmount cho cycle mới). */
  jackpot1Opening: number;
  /** Giá trị JP1 hiện tại (cộng dồn mỗi kỳ settle). */
  jackpot1Current: number;
  /** Giá trị JP2 khi bắt đầu cycle. */
  jackpot2Opening: number;
  /** Giá trị JP2 hiện tại. */
  jackpot2Current: number;

  /** DrawId kỳ đầu tiên của cycle. */
  startDrawId: string;
  /** DrawId kỳ cuối cùng (kỳ settle kết thúc cycle). Chỉ set khi closed. */
  endDrawId?: string;
  /** Số kỳ quay đã settle trong cycle này. */
  drawCount: number;

  /** Lý do đóng cycle. Chỉ set khi status = "closed". */
  closedReason?: JackpotCycleClosedReason;
  /** Thời điểm đóng cycle. */
  closedAt?: Date;

  /** Chi tiết chia giải khi closedReason = "split". */
  splitDetail?: JackpotSplitDetail;

  /** Danh sách người trúng Jackpot (khi có winner). */
  winners?: JackpotWinnerInfo[];

  /** Thời điểm tạo document (= thời điểm bắt đầu cycle). */
  createdAt: Date;
  /** Thời điểm cập nhật gần nhất (sau mỗi lần settle cộng contribution). */
  updatedAt: Date;
}

/** Application layer entity. */
export interface JackpotCycleEntity extends Omit<JackpotCycleDoc, "_id"> {
  /** ObjectId dạng hex string – khóa chính dùng trong application layer. */
  id: string;
}
