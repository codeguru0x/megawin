/**
 * Lotto 5/35 – Player Game Config DTOs
 *
 * Dữ liệu cấu hình game trả cho player qua API Gateway.
 * Chỉ chứa thông tin player cần để render UI — loại bỏ dữ liệu tài chính nội bộ.
 */

// ─── Play Rules ───

export interface PlayerGameRules {
  /** Giá 1 line (bộ số con) cho 1 kỳ (VND). */
  unitPrice: number;
  /** Số lần cược tối thiểu per board (≥ 1). */
  minBetCount: number;
  /** Số lần cược tối đa per board. */
  maxBetCount: number;
  /** Số board tối đa trên 1 vé (A-E). */
  maxBoardsPerTicket: number;
  /** Số kỳ liên tiếp tối đa. */
  maxDrawCount: number;
  /** Số kỳ quay mỗi ngày. */
  drawsPerDay: number;
  /** Giờ quay trong ngày. VD: ["13:00", "21:00"]. */
  drawTimes: string[];
}

// ─── Prize Amounts ───

export interface PlayerPrizeAmounts {
  /** Giải Nhất (5 số chính). */
  tier1: number;
  /** Giải Nhì (4 chính + đặc biệt). */
  tier2: number;
  /** Giải Ba (4 chính). */
  tier3: number;
  /** Giải Tư (3 chính + đặc biệt). */
  tier4: number;
  /** Giải Năm (3 chính). */
  tier5: number;
  /** Giải Khuyến Khích (chỉ đặc biệt). */
  consolation: number;
}

// ─── Jackpot Config (thông tin hiển thị cho player) ───

export interface PlayerJackpotConfig {
  /** Số tiền khởi điểm khi mở vòng Jackpot mới (VND). */
  seedAmount: number;
  /** Ngưỡng kích hoạt chia giải Độc Đắc (VND). */
  splitThreshold: number;
}

// ─── Tenant Config ───

export interface PlayerTenantGameConfig {
  /** Tenant này có được phép chơi game Lotto 5/35 không. */
  isEnabled: boolean;
}

// ─── Output ───

export interface PlayerGetGameConfigOutput {
  game: PlayerGameRules;
  prizes: PlayerPrizeAmounts;
  jackpot: PlayerJackpotConfig;
  tenant: PlayerTenantGameConfig;
}
