/**
 * Keno – Prize Tables (Bảng giải thưởng)
 *
 * Keno Vietlott – Cơ cấu giải thưởng cách chơi cơ bản:
 *
 * Bảng thưởng ứng với mệnh giá 10.000đ:
 *
 * Cột: "Bạn chơi bao nhiêu số" (pickCount)
 * Hàng: "Bạn trúng bao nhiêu số" (matchCount)
 *
 * ┌──────────┬───────────┬───────────┬───────────┬───────────┬───────────┬───────────┬───────────┬───────────┬───────────┬───────────┐
 * │ match\pick│    10    │     9    │     8    │     7    │     6    │     5    │     4    │     3    │     2    │     1    │
 * ├──────────┼───────────┼───────────┼───────────┼───────────┼───────────┼───────────┼───────────┼───────────┼───────────┼───────────┤
 * │    10    │ 2 Tỷ *   │          │          │          │          │          │          │          │          │          │
 * │     9    │ 150 tr   │ 800 tr * │          │          │          │          │          │          │          │          │
 * │     8    │ 8 tr     │ 12 tr    │ 200 tr * │          │          │          │          │          │          │          │
 * │     7    │ 710.000  │ 1,5 tr   │ 5 tr     │ 40 tr    │          │          │          │          │          │          │
 * │     6    │ 80.000   │ 150.000  │ 500.000  │ 1,2 tr   │ 12,5 tr  │          │          │          │          │          │
 * │     5    │ 20.000   │ 30.000   │ 50.000   │ 100.000  │ 450.000  │ 4,4 tr   │          │          │          │          │
 * │     4    │          │ 10.000   │ 10.000   │ 20.000   │ 40.000   │ 150.000  │ 400.000  │          │          │          │
 * │     3    │          │          │ 10.000   │ 10.000   │ 10.000   │ 10.000   │ 50.000   │ 200.000  │          │          │
 * │     2    │          │          │          │          │          │ 10.000   │ 20.000   │ 90.000   │          │          │
 * │     1    │          │          │          │          │          │          │          │          │          │ 20.000   │
 * │     0    │ 10.000   │ 10.000   │ 10.000   │          │          │          │          │          │          │          │
 * └──────────┴───────────┴───────────┴───────────┴───────────┴───────────┴───────────┴───────────┴───────────┴───────────┴───────────┘
 *
 * (*) Giải có giới hạn trả thưởng mỗi kỳ quay.
 *
 * NGUỒN DỮ LIỆU THẬT: `DEFAULT_KENO_CONFIG.basicPrizes` (`./financials`) — cũng là
 * bảng seed cho `GlobalConfigDoc.basicPrizes` (DB). File này KHÔNG hardcode lại số
 * liệu, chỉ chứa pure function tra bảng — caller (production hoặc test) tự truyền
 * `prizeTable` được build từ config/fixture của mình.
 */

// ─────────────────────────────────────────────
// Lookup Functions
// ─────────────────────────────────────────────

/**
 * Tra cứu giải thưởng cách chơi cơ bản.
 *
 * Pure function — không tự fallback về bảng mặc định nào. Production luôn build
 * `prizeTable` từ `config.basicPrizes` (DB) tại `settle-entries.ts` (key trần
 * `pickCount`, xem cách bridge từ key domain `"pickN"` ở đó). Unit test tự build
 * fixture riêng (xem `game-keno-application/test/.../helpers/default-prize-tables.ts`)
 * — KHÔNG đặt fixture test trong package này để tránh mix dữ liệu test vào rules layer.
 *
 * @param pickCount - Số lượng số đã chọn (1-10)
 * @param matchCount - Số lượng số trùng
 * @param prizeTable - Bảng giải thưởng, key trần `pickCount` → `matchCount` → VND
 * @returns Giá trị giải thưởng (VND), 0 nếu không trúng
 */
export function lookupBasicPrize(
  pickCount: number,
  matchCount: number,
  prizeTable: Record<string, Record<string, number>>,
): number {
  const tierPrizes = prizeTable[String(pickCount)];
  if (!tierPrizes) return 0;
  return tierPrizes[String(matchCount)] ?? 0;
}
