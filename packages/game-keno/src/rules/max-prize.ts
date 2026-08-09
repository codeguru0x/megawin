/**
 * Keno – Max Prize helpers (cho exposure / potentialWin worst-case).
 *
 * Tính giải thưởng CAO NHẤT có thể của 1 bộ cược (đơn giá `unitPrice`), dùng cho
 * ops exposure (analysis §3.4): "kỳ này tệ nhất trả bao nhiêu". KHÔNG hardcode
 * bảng giải — nhận prize config (từ GlobalConfig) làm tham số để đồng bộ khi staff
 * chỉnh giải.
 *
 * Giá trị trả về đã chuẩn hoá theo mệnh giá 10.000đ (bảng prize gốc). Caller nhân
 * với `betCount` để ra worst-case của board.
 */

import { KENO_BASIC_PLAY_TYPE_SET, KenoBigSmallBet, KenoEvenOddBet, KenoPlayType } from "../entities/enums";
import type { BasicPrizes, BigSmallPrizes, EvenOddPrizes, PayoutCaps } from "../entities/types";
import { lookupBasicPrize } from "./prize-tables";

/**
 * Giải thưởng cao nhất 1 bộ cược basic pickN (VND, per bet unit).
 *
 * Worst-case = trúng hết N/N → tra `basicPrizes["N"]["N"]`. Delegate `lookupBasicPrize`
 * (matchCount = pickCount) thay vì tự tra tier — tránh duplicate logic tra bảng giải.
 *
 * @param pickCount - Số đã chọn (1–10).
 * @param basicPrizes - Bảng giải basic từ config.
 */
export function maxBasicPrize(pickCount: number, basicPrizes: BasicPrizes): number {
  return lookupBasicPrize(pickCount, pickCount, basicPrizes);
}

/**
 * Giải thưởng cao nhất của 1 lựa chọn Lớn/Nhỏ (VND, per bet unit).
 *
 * Mỗi hướng có 1 giải khi thắng: big/small trúng ở mức ≥13, draw ở mức hoà.
 */
export function maxBigSmallPrize(bet: string, prizes: BigSmallPrizes): number {
  switch (bet) {
    case KenoBigSmallBet.Big:
      return Math.max(prizes.big13Plus, prizes.big1112);
    case KenoBigSmallBet.Small:
      return Math.max(prizes.small13Plus, prizes.small1112);
    case KenoBigSmallBet.BigSmallDraw:
      return prizes.draw;
    default:
      return 0;
  }
}

/**
 * Giải thưởng cao nhất của 1 lựa chọn Chẵn/Lẻ (VND, per bet unit).
 */
export function maxEvenOddPrize(bet: string, prizes: EvenOddPrizes): number {
  switch (bet) {
    case KenoEvenOddBet.Even:
      return Math.max(prizes.even15Plus, prizes.even1314);
    case KenoEvenOddBet.Even1112:
      return prizes.even1112;
    case KenoEvenOddBet.Odd1112:
      return prizes.odd1112;
    case KenoEvenOddBet.Odd:
      return Math.max(prizes.odd15Plus, prizes.odd1314);
    case KenoEvenOddBet.EvenOddDraw:
      return prizes.draw;
    default:
      return 0;
  }
}

/**
 * Giải thưởng cao nhất 1 bộ cược bất kỳ (basic hoặc side bet) — VND per bet unit.
 *
 * `playType` chỉ dùng để PHÂN LOẠI basic vs side bet (`KENO_BASIC_PLAY_TYPE_SET`) — pickCount
 * thực tế lấy thẳng từ `numbersLen` (đã có sẵn ở caller từ `board.numbers.length`), KHÔNG
 * parse ngược lại từ string `playType` (basic playType luôn được sinh RA từ numbers.length lúc
 * place-bet — `numbersLen` mới là nguồn dữ liệu, parse ngược là convert dư thừa).
 * Side bet dùng `bet` để tra bảng tương ứng. Trả 0 nếu không xác định (input xấu — worst-case
 * bỏ qua an toàn).
 *
 * @param playType - Loại chơi board.
 * @param bet - Hướng side bet (nếu là side bet).
 * @param numbersLen - Số lượng số đã chọn (nếu là basic).
 * @param prizes - Bộ 3 bảng giải từ config.
 */
export function maxBoardPrize(
  playType: KenoPlayType,
  bet: string | undefined,
  numbersLen: number,
  prizes: { basic: BasicPrizes; bigSmall: BigSmallPrizes; evenOdd: EvenOddPrizes },
): number {
  if (KENO_BASIC_PLAY_TYPE_SET.has(playType)) {
    return maxBasicPrize(numbersLen, prizes.basic);
  }
  if (playType === KenoPlayType.BigSmall && bet) {
    return maxBigSmallPrize(bet, prizes.bigSmall);
  }
  if (playType === KenoPlayType.EvenOdd && bet) {
    return maxEvenOddPrize(bet, prizes.evenOdd);
  }
  return 0;
}

/** Kết quả exposure worst-case sau khi áp cap trả thưởng kỳ. */
export interface CappedExposure {
  /** Worst-case theo từng kiểu chơi (VND) — pick8/9/10 đã chặn min với cap kỳ. */
  worstCaseByPlayType: Record<string, number>;
  /** Tổng worst-case toàn kỳ (VND) = Σ worstCaseByPlayType (sau cap). */
  worstCaseTotal: number;
}

/**
 * Áp cap trả thưởng kỳ lên worst-case exposure RAW (chưa cap) theo từng kiểu chơi.
 *
 * Doc `keno_draw_betting_stats.exposure.worstCaseByPlayType` lưu giá trị RAW (chưa cap)
 * để cộng/trừ delta (void) không bị lệch do baseline đã bị cap (analysis §3.4). Cap chỉ
 * áp lúc BUILD RESPONSE / eval alert — pure, idempotent, không đổi khi gọi lại nhiều lần.
 *
 * pick8/9/10 bị giới hạn `maxPerDraw` (Vietlott chia đều pool khi vượt). Các kiểu chơi
 * khác không có cap → giữ nguyên (đã `Math.max(0, ...)`).
 *
 * @param raw - `worstCaseByPlayType` RAW từ doc (có thể chứa số âm tạm thời do void — floor 0).
 * @param caps - Cap trả thưởng kỳ từ GlobalConfig.
 */
export function capExposureByPlayType(raw: Record<string, number>, caps: PayoutCaps): CappedExposure {
  const worstCaseByPlayType: Record<string, number> = {};
  let worstCaseTotal = 0;

  for (const [pt, rawValue] of Object.entries(raw)) {
    let value = Math.max(0, rawValue);

    if (pt === KenoPlayType.Pick8) {
      value = Math.min(value, caps.pick8MaxPerDraw);
    } else if (pt === KenoPlayType.Pick9) {
      value = Math.min(value, caps.pick9MaxPerDraw);
    } else if (pt === KenoPlayType.Pick10) {
      value = Math.min(value, caps.pick10MaxPerDraw);
    }

    worstCaseByPlayType[pt] = value;
    worstCaseTotal += value;
  }

  return { worstCaseByPlayType, worstCaseTotal };
}
