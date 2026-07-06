/**
 * Power 6/55 – Play Types & Line Counting
 *
 * Standard: chọn đúng 6 số → 1 line
 * Bao 5: chọn 5 số, HT ghép 50 số còn lại (55-5=50) → 50 lines
 * Bao N (7-18): chọn N số → C(N,6) lines
 */

import { PlayType } from "../entities/enums";
import { POWER655_MAIN_COUNT, VALID_MAIN_NUMBER_SET } from "../entities/types";

// ─────────────────────────────────────────────
// Play Rule Hard Caps (chống abuse — độc lập với config động)
// ─────────────────────────────────────────────

/**
 * Hard cap tuyệt đối số board mỗi vé Power 6/55 — chống payload lạm dụng.
 *
 * Đây KHÔNG phải giới hạn nghiệp vụ (giới hạn thật là `play.maxBoardsPerTicket`
 * trong game config, có thể nhỏ hơn). Dùng làm trần cứng ở 2 tầng:
 * - Zod schema place-bet: `boards[]` không quá {@link POWER655_MAX_BOARDS}.
 * - Zod schema update game config: `maxBoardsPerTicket` không cấu hình vượt trần này.
 *
 * Đảm bảo `maxBoardsPerTicket` luôn ≤ số board tối đa mà API chấp nhận.
 */
export const POWER655_MAX_BOARDS = 100;

// ─── Combinatorics ───

export function combination(n: number, k: number): number {
  if (k > n || k < 0) return 0;
  if (k === 0 || k === n) return 1;
  let result = 1;
  for (let i = 0; i < Math.min(k, n - k); i++) {
    result = (result * (n - i)) / (i + 1);
  }
  return Math.round(result);
}

// ─── Play Type Definitions ───

export interface PlayTypeConfig {
  playType: PlayType;
  label: string;
  mainCount: number;
  lineCount: number;
  multiplier: number;
}

function baoConfig(playType: PlayType, label: string, mainCount: number): PlayTypeConfig {
  const lineCount = combination(mainCount, POWER655_MAIN_COUNT);
  return { playType, label, mainCount, lineCount, multiplier: lineCount };
}

export const PLAY_TYPE_CONFIGS: Record<PlayType, PlayTypeConfig> = {
  [PlayType.Standard]: {
    playType: PlayType.Standard,
    label: "Cơ bản",
    mainCount: 6,
    lineCount: 1,
    multiplier: 1,
  },
  /**
   * Bao 5 đặc biệt: chọn 5 số, HT ghép lần lượt 50 số còn lại (55-5=50) → 50 lines.
   * KHÔNG dùng C(N,6) như Bao 7-18. lineCount = POWER655_MAIN_MAX - mainCount = 55 - 5 = 50.
   */
  [PlayType.Bao5]: {
    playType: PlayType.Bao5,
    label: "Bao 5",
    mainCount: 5,
    lineCount: 50,
    multiplier: 50,
  },
  [PlayType.Bao7]: baoConfig(PlayType.Bao7, "Bao 7", 7),
  [PlayType.Bao8]: baoConfig(PlayType.Bao8, "Bao 8", 8),
  [PlayType.Bao9]: baoConfig(PlayType.Bao9, "Bao 9", 9),
  [PlayType.Bao10]: baoConfig(PlayType.Bao10, "Bao 10", 10),
  [PlayType.Bao11]: baoConfig(PlayType.Bao11, "Bao 11", 11),
  [PlayType.Bao12]: baoConfig(PlayType.Bao12, "Bao 12", 12),
  [PlayType.Bao13]: baoConfig(PlayType.Bao13, "Bao 13", 13),
  [PlayType.Bao14]: baoConfig(PlayType.Bao14, "Bao 14", 14),
  [PlayType.Bao15]: baoConfig(PlayType.Bao15, "Bao 15", 15),
  [PlayType.Bao18]: baoConfig(PlayType.Bao18, "Bao 18", 18),
};

// ─── Validation ───

export function getLineCount(playType: PlayType): number {
  return PLAY_TYPE_CONFIGS[playType].lineCount;
}

export function getRequiredMainCount(playType: PlayType): number {
  return PLAY_TYPE_CONFIGS[playType].mainCount;
}

export function validateMainNumbers(
  mainNumbers: string[],
  playType: PlayType,
): { valid: boolean; error?: string } {
  const config = PLAY_TYPE_CONFIGS[playType];
  if (!config) return { valid: false, error: `PlayType không hợp lệ: ${playType}` };

  const expectedCount = config.mainCount;
  if (mainNumbers.length !== expectedCount) {
    return {
      valid: false,
      error: `${playType} cần ${expectedCount} số, nhận ${mainNumbers.length}`,
    };
  }

  const uniqueNums = new Set(mainNumbers);
  if (uniqueNums.size !== mainNumbers.length) {
    return { valid: false, error: "Các số không được trùng nhau" };
  }

  for (const n of mainNumbers) {
    if (!VALID_MAIN_NUMBER_SET.has(n)) {
      return {
        valid: false,
        error: `Số "${n}" không hợp lệ (phải từ "01" đến "55")`,
      };
    }
  }

  return { valid: true };
}

// ─── Bao Prize Amounts (default, from images) ───

/**
 * Giải thưởng cố định cho từng loại Bao.
 * Các giá trị Jackpot1 Jackpot2 là phần chia (fraction) từ jackpot pool.
 * Số tiền cố định thêm vào ngoài phần Jackpot.
 *
 * Key format: `baoN_matchM` hoặc `baoN_matchM_bonus`
 */
export interface BaoPrizeEntry {
  playType: PlayType;
  mainMatched: number;
  bonusMatched: boolean;
  fixedAmount: number;
  jackpot1Fraction: number; // 0 = none, >0 = fraction of JP1 pool
  jackpot2Fraction: number; // 0 = none, >0 = fraction of JP2 pool
}

/**
 * Tỷ lệ Jackpot khi chơi Bao.
 * Ví dụ Bao 7:
 *   Trúng 6 số = Jackpot 1* + 240 Triệu → JP1 chia 6 (C(7,6)/C(7,6))
 *   Trúng 6 + bonus = Jackpot 1* + Jackpot 2*
 *
 * Jackpot 1* = Jackpot1 chia thành 6 phần đều nhau (C(N,6) lines)
 * Jackpot 2* = Jackpot2 chia thành 6 phần đều nhau
 *
 * Thực tế: prize per line = jackpot / totalLines
 * Nên việc chia là tự nhiên qua lineCount.
 */
