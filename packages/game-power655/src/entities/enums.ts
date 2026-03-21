/**
 * Power 6/55 – Enums
 *
 * Tất cả enum riêng cho game Power 6/55.
 * Enums chung (DrawStatus, EntryStatus, TicketStatus, ...) lấy từ @megawin/game-core.
 */

/**
 * MongoDB collection names cho Power 6/55.
 * Mỗi game có prefix riêng để tách biệt dữ liệu trong cùng 1 database.
 */
export const Power655Collections = {
  /** Cấu hình game: global config + tenant-specific overrides. */
  GameConfigs: "power655_game_configs",
  /** Vé đã mua – immutable sau khi tạo, chứa boards + draw plan. */
  Tickets: "power655_tickets",
  /** Đơn cược tham gia 1 kỳ quay – đơn vị settle/report. 1 ticket × 1 draw = 1 entry. */
  TicketEntries: "power655_ticket_entries",
  /** Lines expand từ boards – tạo lúc settle, dùng để match kết quả. */
  TicketLines: "power655_ticket_lines",
  /** Kỳ quay mở thưởng – lifecycle: scheduled → salesOpen → salesClosed → published → settling → settled. */
  Draws: "power655_draws",
  /** Chu kỳ Jackpot – theo dõi tích luỹ JP1 + JP2 từ seed đến khi có winner. */
  JackpotCycles: "power655_jackpot_cycles",
} as const;

/**
 * Hạng giải thưởng Power 6/55.
 *
 * Cơ cấu 5 hạng giải (theo thể lệ Vietlott):
 *
 * | Hạng       | Điều kiện                        | Giá trị             |
 * |------------|----------------------------------|---------------------|
 * | Jackpot 1  | Trùng 6/6 số chính               | Tích luỹ, tối thiểu 30 tỷ |
 * | Jackpot 2  | Trùng 5/6 số + bonus number      | Tích luỹ, tối thiểu 3 tỷ  |
 * | Giải Nhất  | Trùng 5/6 số (không trùng bonus) | 40.000.000đ         |
 * | Giải Nhì   | Trùng 4/6 số                     | 500.000đ            |
 * | Giải Ba    | Trùng 3/6 số                     | 50.000đ             |
 *
 * Ghi chú: bonus number được quay từ 49 quả bóng còn lại sau khi rút 6.
 * Trúng nhiều hạng → chỉ lĩnh hạng cao nhất.
 */
export const PrizeTier = {
  /** Trùng 6/6 số chính – giải tích luỹ tối thiểu 30 tỷ. */
  Jackpot1: "jackpot1",
  /** Trùng 5/6 số + bonus number – giải tích luỹ tối thiểu 3 tỷ. */
  Jackpot2: "jackpot2",
  /** Giải Nhất: trùng 5/6 số (không trùng bonus) – cố định 40 triệu/lần tham gia. */
  Tier1: "tier1",
  /** Giải Nhì: trùng 4/6 số – cố định 500.000đ/lần tham gia. */
  Tier2: "tier2",
  /** Giải Ba: trùng 3/6 số – cố định 50.000đ/lần tham gia. */
  Tier3: "tier3",
} as const;
export type PrizeTier = (typeof PrizeTier)[keyof typeof PrizeTier];

/**
 * Loại hình chơi Power 6/55.
 *
 * - Standard: chọn đúng 6 số → 1 bộ số dự thưởng
 * - Bao 5: chọn 5 số, hệ thống ghép lần lượt 50 số còn lại (55-5) → 50 bộ số
 * - Bao N (7-18): chọn N số, hệ thống tạo tất cả tổ hợp C(N,6) bộ số
 *
 * Giá vé = unitPrice × số bộ số × số kỳ quay.
 * Ví dụ: Bao 5 = 50 bộ × 10.000đ = 500.000đ/kỳ.
 * Ví dụ: Bao 7 = C(7,6) = 7 bộ × 10.000đ = 70.000đ/kỳ.
 */
export const PlayType = {
  /** Cơ bản: chọn đúng 6 số → 1 bộ số dự thưởng. */
  Standard: "standard",
  /**
   * Bao 5: chọn 5 số, hệ thống ghép lần lượt 50 số còn lại (55-5=50) → 50 bộ số.
   * Khác Bao 7-18: không dùng tổ hợp C(N,6) mà ghép từng số trong 50 số còn lại.
   */
  Bao5: "bao5",
  /** Bao 7: chọn 7 số → C(7,6) = 7 bộ số. */
  Bao7: "bao7",
  /** Bao 8: chọn 8 số → C(8,6) = 28 bộ số. */
  Bao8: "bao8",
  /** Bao 9: chọn 9 số → C(9,6) = 84 bộ số. */
  Bao9: "bao9",
  /** Bao 10: chọn 10 số → C(10,6) = 210 bộ số. */
  Bao10: "bao10",
  /** Bao 11: chọn 11 số → C(11,6) = 462 bộ số. */
  Bao11: "bao11",
  /** Bao 12: chọn 12 số → C(12,6) = 924 bộ số. */
  Bao12: "bao12",
  /** Bao 13: chọn 13 số → C(13,6) = 1.716 bộ số. */
  Bao13: "bao13",
  /** Bao 14: chọn 14 số → C(14,6) = 3.003 bộ số. */
  Bao14: "bao14",
  /** Bao 15: chọn 15 số → C(15,6) = 5.005 bộ số. */
  Bao15: "bao15",
  /** Bao 18: chọn 18 số → C(18,6) = 18.564 bộ số. */
  Bao18: "bao18",
} as const;
export type PlayType = (typeof PlayType)[keyof typeof PlayType];

/**
 * Trạng thái chi trả thưởng cho entry thắng.
 *
 * Flow: pending → dispatched → confirmed
 *                  ↘ failed (retry up to 10 lần)
 */
export const PayoutStatus = {
  /** Chờ gửi yêu cầu trả thưởng cho tenant. */
  Pending: "pending",
  /** Đã gửi yêu cầu qua TenantGateway API, chờ xác nhận. */
  Dispatched: "dispatched",
  /** Tenant xác nhận đã trả thưởng thành công. */
  Confirmed: "confirmed",
  /** Gửi thất bại – sẽ retry. Xem lastError để biết lý do. */
  Failed: "failed",
} as const;
export type PayoutStatus = (typeof PayoutStatus)[keyof typeof PayoutStatus];

/**
 * Trạng thái hoàn tiền khi kỳ quay bị void.
 *
 * Flow: pending → dispatched → confirmed
 *                  ↘ failed (retry up to 10 lần)
 */
export const RefundStatus = {
  /** Chờ gửi yêu cầu hoàn tiền cho tenant. */
  Pending: "pending",
  /** Đã gửi yêu cầu qua TenantGateway API, chờ xác nhận. */
  Dispatched: "dispatched",
  /** Tenant xác nhận đã hoàn tiền thành công. */
  Confirmed: "confirmed",
  /** Gửi thất bại – sẽ retry. Xem lastError để biết lý do. */
  Failed: "failed",
} as const;
export type RefundStatus = (typeof RefundStatus)[keyof typeof RefundStatus];
