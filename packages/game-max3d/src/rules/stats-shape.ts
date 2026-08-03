/**
 * Max 3D – Stats Shape Factories (pure)
 *
 * Factory tạo shape rỗng cho `byPlayType` (4 nhóm phẳng cố định) của
 * `max3d_draw_betting_stats`.
 *
 * ## Vì sao cần factory dùng chung?
 *
 * Từ p0-01 worker ghi stats bằng `$inc` theo path thay vì `$set` full doc. `$inc` tự tạo
 * path còn thiếu, nhưng CHỈ path được chạm — nếu 1 tick chỉ có cược `plus` thì doc chỉ có
 * `byPlayType.plus`, 3 nhóm khác **không tồn tại**. `Max3dByPlayType` là interface shape
 * cố định (KHÔNG phải Record) nên reader truy cập thẳng `bp.basicStraight.amount` → nổ
 * runtime nếu không ai bù nhóm thiếu.
 *
 * Từ p0-04 (stats-worker-simplification) chỗ bù nhóm đó nằm **PHÍA ĐỌC**:
 * `BettingStatsMapper.mapProps` normalize mọi nhóm thiếu về zero-stat; repo KHÔNG còn seed
 * skeleton lúc `ensureDocs` (default 1 nơi duy nhất → thêm field mới không cần migration).
 *
 * Factory ở đây để mapper (normalize phía đọc) và accumulator (gom delta) dùng **cùng một
 * nguồn** — thêm nhóm play type mới chỉ sửa 1 chỗ, không lệch giữa 2 nơi (rule
 * code-quality-standards §5).
 *
 * Khác `tripletStakes`/`byTenant` (đều là `Record`): reader ở đó đã tolerant `?? {}` nên
 * KHÔNG cần seed 1000 triplet — để `$inc` tự sinh key khi có cược, doc nhẹ hơn.
 */

import type { Max3dByPlayType, Max3dPlayTypeStat } from "../entities/betting-stats";

/** Stat rỗng 1 nhóm play type. */
export function createEmptyPlayTypeStat(): Max3dPlayTypeStat {
  return { amount: 0, units: 0, boards: 0, entries: 0 };
}

/**
 * `byPlayType` rỗng đủ 4 nhóm (basicStraight/basicCombo3/basicCombo6/plus).
 *
 * Dùng cho: (1) mapper normalize doc thiếu nhóm phía đọc; (2) accumulator khởi tạo delta
 * của 1 tick (nếu cần khai đủ nhóm — hiện accumulator dùng `PartialByPlayTypeDelta` nên
 * chỉ tham chiếu factory này ở mapper).
 */
export function createEmptyByPlayType(): Max3dByPlayType {
  return {
    basicStraight: createEmptyPlayTypeStat(),
    basicCombo3: createEmptyPlayTypeStat(),
    basicCombo6: createEmptyPlayTypeStat(),
    plus: createEmptyPlayTypeStat(),
  };
}
