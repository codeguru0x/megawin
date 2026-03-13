/**
 * Power 6/55 – Jackpot Cycle Entity (Chu kỳ Jackpot)
 *
 * Power 6/55 có 2 jackpot tích luỹ chạy SONG SONG trong 1 cycle:
 *   - Jackpot 1: giải trùng 6/6 số chính (seed mặc định 30 tỷ)
 *   - Jackpot 2: giải trùng 5/6 + bonus number (seed mặc định 3 tỷ)
 *
 * ── Vòng đời cycle (theo thể lệ Vietlott chính thức) ──────────────────────
 *   1. Tạo cycle mới với seed amounts + config snapshot (đọc từ GlobalConfig)
 *   2. Mỗi kỳ quay: cộng contribution (jp1Ratio cho JP1, jp2Ratio cho JP2)
 *   3. Overflow: khi JP1 > jp1OverflowThreshold VÀ không có JP1 winner:
 *      - Có JP2 winner → phần vượt chuyển sang JP2 kỳ đó
 *      - Không có JP2 winner → phần vượt trả về JP1 kỳ tiếp
 *   4. Cycle kết thúc KHI VÀ CHỈ KHI: JP1 có winner (hoặc admin reset)
 *   5. JP2 winner → reset jackpot2CurrentAmount về seed, KHÔNG đóng cycle.
 *      JP2 có thể reset NHIỀU LẦN trong 1 cycle. Lịch sử lưu ở jackpot2Resets[].
 *   6. Khi đóng cycle (JP1 winner): JP2 carry over giá trị hiện tại vào cycle mới
 *      (KHÔNG reset JP2 về seed khi JP1 win, trừ khi cùng kỳ JP2 cũng trúng).
 *
 * ── Config snapshot ────────────────────────────────────────────────────────
 * jp1ContributionRatio, jp2ContributionRatio, jp1OverflowThreshold được chốt
 * lại khi tạo cycle — operator thay đổi GlobalConfig giữa chừng không ảnh
 * hưởng tính toán của cycle đang chạy.
 *
 * Theo luật Vietlott, Power 6/55 KHÔNG CÓ cơ chế "Split Cycle".
 * Jackpot tích lũy không giới hạn cho đến khi có winner.
 *
 * 1 cycle active tại 1 thời điểm. Cycles đã closed lưu lịch sử.
 * Collection: power655JackpotCycles.
 */

/**
 * Lý do đóng chu kỳ jackpot.
 *
 * Theo thể lệ Vietlott: cycle chỉ đóng khi JP1 có winner.
 * JP2 winner KHÔNG đóng cycle — JP2 reset trong cycle, lưu vào jackpot2Resets[].
 * Dùng cho audit và hiển thị lịch sử.
 */
export const JackpotCycleClosedReasons = {
  /** Có người trúng JP1 (trùng 6/6 số chính). JP2 carry over sang cycle mới. */
  Jackpot1Winner: "jackpot1_winner",
  /** Cả JP1 và JP2 đều có winner trong cùng kỳ. Cả 2 đều reset. */
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
  Jackpot1: "jackpot1",
  /** Jackpot 2: trùng 5/6 + bonus number. */
  Jackpot2: "jackpot2",
} as const;

/** Union type loại jackpot. */
export type JackpotTypeValue = (typeof JackpotType)[keyof typeof JackpotType];

// ─────────────────────────────────────────────
// Embedded Document Interfaces
// ─────────────────────────────────────────────

/**
 * Config Jackpot snapshot tại thời điểm tạo cycle.
 *
 * Chốt từ GlobalConfig khi cycle được khởi tạo — không thay đổi
 * dù operator cập nhật GlobalConfig sau đó. Đảm bảo tính nhất quán
 * trong toàn bộ vòng đời cycle.
 */
export interface JackpotCycleConfig {
  /**
   * Tỷ lệ tổng contribution đổ vào JP1 (0-1, mặc định 0.9 = 90%).
   * jp1ContributionRatio + jp2ContributionRatio = 1.
   */
  jp1ContributionRatio: number;
  /**
   * Tỷ lệ tổng contribution đổ vào JP2 (0-1, mặc định 0.1 = 10%).
   * jp1ContributionRatio + jp2ContributionRatio = 1.
   */
  jp2ContributionRatio: number;
  /**
   * Ngưỡng tràn JP1 (VND, mặc định 300 tỷ).
   * Khi JP1 vượt ngưỡng, phần dư tự động chuyển sang JP2.
   */
  jp1OverflowThreshold: number;
}

/** Thông tin người trúng Jackpot. */
export interface JackpotWinnerInfo {
  /** ID tài khoản người chơi. */
  accountId: string;
  /** Username hiển thị — bắt buộc để nhận diện người thắng. */
  username: string;
  /** ID tenant / đại lý. */
  tenantId: string;
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
 * Bản ghi 1 lần JP2 được reset trong cycle (có JP2 winner).
 *
 * Theo luật Vietlott: JP2 winner KHÔNG đóng cycle — JP2 reset về seed,
 * JP1 tiếp tục tích lũy. Mỗi lần JP2 reset được ghi vào jackpot2Resets[]
 * trong cycle document để lưu lịch sử đầy đủ.
 */
export interface Jackpot2ResetRecord {
  /** DrawId kỳ quay có JP2 winner (trigger reset). */
  drawId: string;

  /**
   * Tổng quỹ JP2 tại thời điểm trao thưởng (VND).
   * = jackpot2CurrentAmount (opening kỳ đó) + jackpot2Contribution.
   * Có thể bao gồm jp1Overflow nếu JP1 vượt ngưỡng kỳ đó.
   * Đây là số tiền được chia cho các JP2 winners trong kỳ này.
   */
  jackpot2PrizePool: number;

  /** Danh sách người trúng JP2 trong kỳ này. */
  winners: JackpotWinnerInfo[];

  /** Thời điểm ghi nhận reset. */
  resetAt: Date;
}

/**
 * MongoDB document cho chu kỳ Jackpot.
 *
 * Cycle đại diện cho vòng đời tích lũy của JP1 — từ seed đến khi JP1 có winner.
 * JP2 có thể reset nhiều lần trong 1 cycle, mỗi lần ghi vào jackpot2Resets[].
 */
export interface JackpotCycleDoc {
  /** MongoDB ObjectId – khóa chính nội bộ. Không dùng trong business logic. */
  _id: unknown;
  /** Số thứ tự cycle (tăng dần, unique). Dùng cho hiển thị lịch sử. */
  cycleNo: number;
  /** Trạng thái: active (đang tích luỹ) hoặc closed (đã kết thúc). */
  status: JackpotCycleStatusValue;

  /**
   * Giá trị khởi điểm JP1 khi bắt đầu cycle (VND).
   * Snapshot seedAmount từ GlobalConfig tại thời điểm tạo cycle.
   */
  jackpot1SeedAmount: number;

  /**
   * Giá trị JP1 hiện tại (cộng dồn mỗi kỳ settle).
   * Sau mỗi kỳ: = opening + contribution (= closing kỳ vừa rồi = opening kỳ tiếp).
   */
  jackpot1CurrentAmount: number;

  /**
   * Giá trị khởi điểm JP2 khi bắt đầu cycle (VND).
   * Snapshot seedAmount từ GlobalConfig tại thời điểm tạo cycle.
   */
  jackpot2SeedAmount: number;

  /**
   * Giá trị JP2 hiện tại (cộng dồn mỗi kỳ settle, reset về seed khi JP2 winner).
   * Khi JP2 winner: reset về jp2SeedAmount, giá trị closing trước reset lưu trong
   * jackpot2Resets[].jackpot2PrizePool. Sau reset: = jp2SeedAmount = opening kỳ tiếp.
   */
  jackpot2CurrentAmount: number;

  /** DrawId kỳ đầu tiên của cycle. */
  startDrawId: string;
  /** DrawId kỳ cuối cùng (kỳ settle kết thúc cycle). Chỉ set khi closed. */
  endDrawId?: string;
  /** Số kỳ quay đã settle trong cycle này. */
  drawCount: number;

  /** Config snapshot tại thời điểm tạo cycle — không đổi dù GlobalConfig update sau. */
  config: JackpotCycleConfig;

  /** Lý do đóng cycle. Chỉ set khi status = "closed". */
  closedReason?: JackpotCycleClosedReason;

  /** Thời điểm đóng cycle. */
  closedAt?: Date;

  /**
   * Danh sách người trúng Jackpot 1 — chỉ có khi cycle bị đóng do JP1 winner.
   * JP2 winners không lưu ở đây — xem jackpot2Resets[].
   */
  winners?: JackpotWinnerInfo[];

  /**
   * Số lần JP2 đã reset trong cycle này.
   * JP2 winner KHÔNG đóng cycle — mỗi lần reset cộng 1 vào đây.
   * = jackpot2Resets.length (redundant nhưng giúp query nhanh không cần $size).
   */
  jackpot2ResetCount: number;

  /**
   * Lịch sử các lần JP2 được reset trong cycle.
   * Mỗi phần tử tương ứng 1 kỳ quay có JP2 winner, được $push thêm vào array.
   * Array tăng dần theo thời gian — không xoá phần tử cũ.
   */
  jackpot2Resets: Jackpot2ResetRecord[];

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
