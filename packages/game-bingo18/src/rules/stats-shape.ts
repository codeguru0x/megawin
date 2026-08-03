/**
 * Bingo 18 – Stats Shape Factories (pure)
 *
 * Factory tạo shape rỗng cho `byPlayType` — embedded doc schema CỐ ĐỊNH (38 bucket) của
 * `bingo18_draw_betting_stats`.
 *
 * ## Vì sao cần factory dùng chung?
 *
 * Worker ghi stats bằng `$inc` theo path (p0-01) — `$inc` tự tạo path còn thiếu, nhưng CHỈ
 * path được chạm. Nếu 1 tick chỉ có cược `singleNum`, doc chỉ có `byPlayType.singleNum`, các
 * nhánh khác **không tồn tại**. `Bingo18ByPlayType` là interface shape cố định (record theo
 * key số + nhánh lồng cố định) nên reader truy cập thẳng `bp.bigSmallDraw.big.amount` → nổ
 * runtime nếu không ai bù nhánh thiếu.
 *
 * Chỗ bù nhánh đó nằm **PHÍA ĐỌC** (p0-04): `BettingStatsMapper.mapProps` normalize mọi
 * nhánh thiếu về zero-bucket; repo KHÔNG seed skeleton lúc `ensureDocs` (default 1 nơi duy
 * nhất → thêm field mới không cần migration).
 *
 * Factory ở đây để mapper (normalize phía đọc) dùng — accumulator (p0-01) KHÔNG cần seed
 * khung vì nó delta-only, chỉ tạo bucket LAZY khi board thực sự chạm tới (F2-a). Giữ đúng 1
 * nguồn định nghĩa "đủ 38 bucket" tránh 2 định nghĩa lệch nhau (code-quality §5).
 */

import type { Bingo18BucketStat, Bingo18ByPlayType } from "../entities/betting-stats";

/** Bucket rỗng — dùng cho mọi nhánh thiếu trong `byPlayType`. */
export function createEmptyBucket(): Bingo18BucketStat {
  return { amount: 0, sets: 0, entries: 0 };
}

/** Key số "1".."6" — dùng cho singleNum/doubleMatch/tripleMatch.specific. */
const NUMBER_KEYS = ["1", "2", "3", "4", "5", "6"] as const;

/** Key tổng "3".."18" — dùng cho sumTotal. */
const SUM_KEYS = Array.from({ length: 16 }, (_, i) => String(i + 3));

/** Record đủ key cố định, bucket rỗng — nền cho `fillBucketRecord` merge doc lên trên. */
function emptyBucketRecord(keys: readonly string[]): Record<string, Bingo18BucketStat> {
  const out: Record<string, Bingo18BucketStat> = {};
  for (const key of keys) {
    out[key] = createEmptyBucket();
  }
  return out;
}

/**
 * `byPlayType` rỗng đủ 38 bucket: singleNum 6 + doubleMatch 6 + tripleMatch.specific 6 +
 * tripleMatch.any 1 + sumTotal 16 + bigSmallDraw 3.
 *
 * Dùng cho mapper normalize doc thiếu nhánh phía đọc (p0-04).
 */
export function createEmptyByPlayType(): Bingo18ByPlayType {
  return {
    singleNum: emptyBucketRecord(NUMBER_KEYS),
    doubleMatch: emptyBucketRecord(NUMBER_KEYS),
    tripleMatch: {
      specific: emptyBucketRecord(NUMBER_KEYS),
      any: createEmptyBucket(),
    },
    sumTotal: emptyBucketRecord(SUM_KEYS),
    bigSmallDraw: {
      big: createEmptyBucket(),
      draw: createEmptyBucket(),
      small: createEmptyBucket(),
    },
  };
}
