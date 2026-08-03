/**
 * Keno – Stats Shape Factories (pure)
 *
 * Factory tạo shape rỗng cho các embedded doc **schema CỐ ĐỊNH** của
 * `keno_draw_betting_stats`.
 *
 * ## Vì sao cần factory dùng chung?
 *
 * Từ p2-01 §3.5 worker ghi stats bằng `$inc` theo path thay vì `$set` full doc. `$inc` tự
 * tạo path còn thiếu, nhưng CHỈ path được chạm — nên nếu 1 tick chỉ có cược `pick8` thì doc
 * chỉ có `byPlayType.pick8`, các slot khác **không tồn tại**. `KenoByPlayType` là interface
 * shape cố định (KHÔNG phải Record) nên reader truy cập thẳng `bp.bigSmall.big.amount` →
 * nổ runtime nếu không ai bù slot thiếu.
 *
 * Từ p0-03 (stats-worker-simplification §5.5) chỗ bù slot đó nằm **PHÍA ĐỌC**:
 * `BettingStatsMapper.mapProps` normalize mọi slot thiếu về zero-stat; repo KHÔNG còn seed
 * skeleton lúc `ensureDocs` (default 1 nơi duy nhất → thêm field mới không cần migration).
 *
 * Factory ở đây để mapper (normalize phía đọc) và accumulator (gom delta) dùng **cùng một
 * nguồn** — thêm play type mới chỉ sửa 1 chỗ, không lệch giữa 2 nơi (rule code-quality §5).
 *
 * Khác `numberFreq`/`byTenant` (đều là `Record`): reader ở đó đã tolerant `?? 0` nên KHÔNG
 * cần seed 80 số — để `$inc` tự sinh key khi có cược, doc nhẹ hơn.
 */

import type { KenoByPlayType, KenoPlayTypeStat } from "../entities/betting-stats";

/** Stat rỗng 1 slot play type. */
export function createEmptyPlayTypeStat(): KenoPlayTypeStat {
  return { amount: 0, sets: 0 };
}

/**
 * `byPlayType` rỗng đủ 15 slot (10 pick + 3 hướng bigSmall + 5 hướng evenOdd).
 *
 * Dùng cho: (1) mapper normalize doc thiếu slot phía đọc; (2) accumulator khởi tạo delta của 1 tick.
 */
export function createEmptyByPlayType(): KenoByPlayType {
  return {
    pick1: createEmptyPlayTypeStat(),
    pick2: createEmptyPlayTypeStat(),
    pick3: createEmptyPlayTypeStat(),
    pick4: createEmptyPlayTypeStat(),
    pick5: createEmptyPlayTypeStat(),
    pick6: createEmptyPlayTypeStat(),
    pick7: createEmptyPlayTypeStat(),
    pick8: createEmptyPlayTypeStat(),
    pick9: createEmptyPlayTypeStat(),
    pick10: createEmptyPlayTypeStat(),
    bigSmall: {
      big: createEmptyPlayTypeStat(),
      small: createEmptyPlayTypeStat(),
      draw: createEmptyPlayTypeStat(),
    },
    evenOdd: {
      even: createEmptyPlayTypeStat(),
      even1112: createEmptyPlayTypeStat(),
      draw: createEmptyPlayTypeStat(),
      odd1112: createEmptyPlayTypeStat(),
      odd: createEmptyPlayTypeStat(),
    },
  };
}
