import { DEFAULT_KENO_CONFIG } from "@megawin/game-keno/rules";
import type { BasicPrizes } from "@megawin/game-keno/entities";

/**
 * Chuyển `BasicPrizes` (key domain `"pickN"`, DB schema) → lookup table key trần
 * `pickCount` (`"N"`) mà `lookupBasicPrize()`/`matchBasicBoard()` cần
 * (`table[String(pickCount)]`) — cùng cách bridge mà `settle-entries.ts` dùng cho
 * config runtime.
 *
 * TEST-ONLY: production luôn build `prizeTable` từ `config.basicPrizes` (DB) tại
 * settle-entries.ts. Đặt ở đây (không phải package `game-keno`) vì đây là fixture
 * chỉ phục vụ test thuật toán match thuần, tách biệt GlobalConfig thật.
 */
function toPickCountKeyedTable(basicPrizes: BasicPrizes): Record<string, Record<string, number>> {
  const table: Record<string, Record<string, number>> = {};
  for (const [pickKey, matchMap] of Object.entries(basicPrizes)) {
    table[pickKey.replace("pick", "")] = matchMap;
  }
  return table;
}

/**
 * Fixture bảng giải cơ bản (key trần "1".."10") cho test `lookupBasicPrize()`/
 * `matchBasicBoard()` — derive từ `DEFAULT_KENO_CONFIG.basicPrizes` (nguồn duy nhất).
 */
export const TEST_BASIC_PRIZE_TABLE: Record<string, Record<string, number>> = toPickCountKeyedTable(
  DEFAULT_KENO_CONFIG.basicPrizes,
);

/** Fixture bảng giải Lớn/Nhỏ cho test `matchBigSmallBet()`. */
export const TEST_BIG_SMALL_PRIZES = DEFAULT_KENO_CONFIG.bigSmallPrizes;

/** Fixture bảng giải Chẵn/Lẻ cho test `matchEvenOddBet()`. */
export const TEST_EVEN_ODD_PRIZES = DEFAULT_KENO_CONFIG.evenOddPrizes;
