/**
 * Power 6/55 – Jackpot Cycle Entity (Chu kỳ Jackpot)
 *
 * Power 6/55 có 2 jackpot tích luỹ chạy SONG SONG:
 *   - Jackpot 1: giải trùng 6/6 số chính (seed mặc định 30 tỷ)
 *   - Jackpot 2: giải trùng 5/6 + bonus number (seed mặc định 3 tỷ)
 *
 * Chu kỳ (cycle) theo dõi tích luỹ từ seed → winner:
 *   1. Tạo cycle mới với seed amounts (đọc từ GlobalConfig)
 *   2. Mỗi kỳ quay: cộng contribution (jp1Ratio cho JP1, jp2Ratio cho JP2)
 *   3. Overflow: khi JP1 > jp1OverflowThreshold → phần vượt chuyển JP2
 *   4. Cycle kết thúc khi: có winner JP1 và/hoặc JP2
 *   5. Tạo cycle mới với seed amounts
 *
 * Theo luật Vietlott, Power 6/55 KHÔNG CÓ cơ chế "Split Cycle".
 * Jackpot tích lũy không giới hạn cho đến khi có winner.
 *
 * 1 cycle active tại 1 thời điểm. Cycles đã closed lưu lịch sử.
 * Collection: power655JackpotCycles.
 */

/**
 * Lý do đóng chu kỳ jackpot.
 * Dùng cho audit và hiển thị lịch sử.
 */
export const JackpotCycleClosedReasons = {
  /** Có người trúng JP1 (trùng 6/6 số chính). */
  Jackpot1Winner: "jackpot1_winner",
  /** Có người trúng JP2 (trùng 5/6 + bonus number). */
  Jackpot2Winner: "jackpot2_winner",
  /** Cả JP1 và JP2 đều có winner trong cùng kỳ. */
  BothWinner: "both_winner",
  /** Admin reset thủ công (không phải do winner). */
  ManualReset: "manual_reset",
} as const;

/** Union type của các lý do đóng cycle. */
export type JackpotCycleClosedReason =
  (typeof JackpotCycleClosedReasons)[keyof typeof JackpotCycleClosedReasons];

/** Trạng thái chu kỳ jackpot. */
export const JackpotCycleStatus = {
  /** Đang tích luỹ, chưa có winner. */
  Active: "active",
  /** Đã kết thúc (có winner hoặc admin reset). */
  Closed: "closed",
} as const;

/** Union type trạng thái cycle. */
export type JackpotCycleStatusValue = (typeof JackpotCycleStatus)[keyof typeof JackpotCycleStatus];

/** Loại jackpot trong Power 6/55. */
export const JackpotType = {
  /** Jackpot 1: trùng 6/6 số chính. */
  Jp1: "jp1",
  /** Jackpot 2: trùng 5/6 + bonus number. */
  Jp2: "jp2",
} as const;

/** Union type loại jackpot. */
export type JackpotTypeValue = (typeof JackpotType)[keyof typeof JackpotType];

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
  /** Jackpot nào trúng. */
  jackpotType: JackpotTypeValue;
}

/**
 * MongoDB document cho chu kỳ Jackpot.
 */
export interface JackpotCycleDoc {
  /** MongoDB ObjectId – khóa chính nội bộ. Không dùng trong business logic. */
  _id: unknown;
  /** Số thứ tự cycle (tăng dần, unique). Dùng cho hiển thị lịch sử. */
  cycleNo: number;
  /** Trạng thái: active (đang tích luỹ) hoặc closed (đã kết thúc). */
  status: JackpotCycleStatusValue;

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
