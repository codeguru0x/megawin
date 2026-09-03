/**
 * ResultFeed – Canonicalization & Hashing (pure)
 *
 * Đây là phần DỄ SAI NHẤT của cả sản phẩm — hai hash, hai mục đích khác nhau,
 * KHÔNG được trộn:
 *
 * | Hash          | Tính từ                                              | Dùng để |
 * |---------------|-------------------------------------------------------|---------|
 * | `payoutHash`  | Số đã canonical (sort tăng dần) + gameKey + drawPeriod | So GIỮA các nguồn. Trả thưởng độc lập thứ tự ⇒ hai nguồn ghi khác thứ tự KHÔNG phải conflict |
 * | `displayHash` | Số ĐÚNG THỨ TỰ nguồn công bố + gameKey + drawPeriod    | Giữ dạng công bố để ghi ra ngoài. Với Bingo18 KHÁC `payoutHash` |
 */

import { sha256Hex } from "@megawin/shared/utils";

import { ResultFeedGameKey } from "../entities/enums";

/**
 * Số bộ ba mỗi hạng giải Max3d/Max3dpro, ĐÚNG THỨ TỰ offset trong `numbersDisplay` —
 * 2 Đặc biệt + 4 Nhất + 6 Nhì + 8 Ba = 20. Quy ước dùng CHUNG bởi `canonicalizeNumbers`
 * (sort riêng từng hạng) và parser nạp lịch sử (`historical-import/parse-max3d.ts`, xem
 * `06-historical-import.plan.md §2.4`) — đặt ở đây (rule layer) để có 1 nguồn chân lý duy
 * nhất cho invariant "tổng 20, chia 4 nhóm cố định", application layer chỉ import lại.
 */
export const MAX3D_TIER_COUNTS = [2, 4, 6, 8] as const;

/**
 * Canonical hoá số của 1 game để so sánh CHÉO NGUỒN.
 *
 * Sort tăng dần cho Keno, Bingo18, Mega645 — vì trả thưởng của các game này đều độc lập
 * thứ tự. KHÔNG dùng kết quả hàm này để ghi ra ngoài: Bingo18 phải công bố đúng thứ tự
 * quay (`5,2,5`), không phải thứ tự sort (`2,5,5`).
 *
 * Bingo18 có số TRÙNG NHAU (3 xúc xắc) ⇒ phải sort như MULTISET, tuyệt đối không dedupe.
 * Dedupe `5,2,5` → `2,5` là mất dữ liệu, và không lỗi compile — đây là lý do có invariant
 * test riêng cho việc này (xem test §4).
 *
 * Lotto535/Power655 KHÁC — không sort toàn mảng: main (5 hoặc 6 phần tử, biên riêng) + 1
 * số đặc biệt/bonus (biên riêng, quy ước LUÔN ở index cuối, xem `parse-lotto535.ts`). 2
 * miền số có thể chồng lấp giá trị (VD `"05"` có thể vừa là main vừa là đặc biệt) — sort
 * toàn mảng flat sẽ làm mất phân biệt main/đặc biệt. Do đó chỉ sort riêng phần main, giữ
 * cố định phần tử cuối (đặc biệt/bonus).
 *
 * Max3d/Max3dpro KHÁC HẲN — 20 phần tử chia 4 hạng giải ĐỘC LẬP (special/first/second/third,
 * xem {@link MAX3D_TIER_COUNTS}). Trong CÙNG 1 hạng, số nào quay ra trước không có ý nghĩa
 * (đều là giải đó) ⇒ sort được như multiset; NHƯNG ranh giới GIỮA các hạng phải giữ cố định
 * (sort xuyên hạng sẽ trộn "Đặc biệt" lẫn "Ba", mất phân biệt hạng giải).
 *
 * ⚠️ Dùng `localeCompare` trên string ĐÃ zero-pad (`"07"`, `"78"`) là đúng; nếu nguồn trả
 * số không zero-pad thì phải normalize TRƯỚC khi gọi hàm này — sort số chưa pad theo string
 * cho kết quả sai (`"10" < "9"`).
 *
 * @param gameKey - Game của kỳ quay — quyết định thuật toán canonical (xem switch bên dưới).
 * @param numbers - Số ĐÚNG THỨ TỰ nguồn công bố, đã zero-pad.
 * @returns Bản copy đã canonical hoá — KHÔNG mutate `numbers` gốc, KHÔNG dedupe.
 */
export function canonicalizeNumbers(gameKey: ResultFeedGameKey, numbers: readonly string[]): string[] {
  switch (gameKey) {
    case ResultFeedGameKey.Lotto535: {
      const main = numbers.slice(0, 5).toSorted((a, b) => a.localeCompare(b));
      const special = numbers.slice(5);
      return [...main, ...special];
    }
    case ResultFeedGameKey.Power655: {
      const main = numbers.slice(0, 6).toSorted((a, b) => a.localeCompare(b));
      const bonus = numbers.slice(6);
      return [...main, ...bonus];
    }
    case ResultFeedGameKey.Keno:
    case ResultFeedGameKey.Bingo18:
    case ResultFeedGameKey.Mega645: {
      return [...numbers].sort((a, b) => a.localeCompare(b));
    }
    case ResultFeedGameKey.Max3d:
    case ResultFeedGameKey.Max3dpro: {
      const result: string[] = [];
      let offset = 0;
      for (const count of MAX3D_TIER_COUNTS) {
        const segment = numbers.slice(offset, offset + count).toSorted((a, b) => a.localeCompare(b));
        result.push(...segment);
        offset += count;
      }
      return result;
    }
    default: {
      const _exhaustive: never = gameKey;
      throw new Error(`canonicalizeNumbers: gameKey không xác định "${_exhaustive}".`);
    }
  }
}

/**
 * Hash của tập số ĐÃ CANONICAL — dùng để so sánh kết quả GIỮA các nguồn, bất kể nguồn
 * ghi số theo thứ tự nào. Luôn include `gameKey` + `drawPeriod` để không thể so chéo
 * game hoặc chéo kỳ do tai nạn (2 kỳ khác nhau ra cùng bộ số vẫn phải là 2 hash khác nhau).
 *
 * @param gameKey - Game của kỳ quay.
 * @param drawPeriod - Mã kỳ THEO NGUỒN (chuẩn hoá zero-pad).
 * @param numbers - Số ĐÚNG THỨ TỰ nguồn công bố (hàm tự canonical hoá trước khi hash).
 */
export function computePayoutHash(gameKey: ResultFeedGameKey, drawPeriod: string, numbers: readonly string[]): string {
  const canonical = canonicalizeNumbers(gameKey, numbers);
  return sha256Hex(`${gameKey}:${drawPeriod}:${canonical.join(",")}`);
}

/**
 * Hash của tập số GIỮ ĐÚNG THỨ TỰ nguồn công bố — dùng để ghi ra ngoài / phát hiện
 * nguồn ghi sai thứ tự (Bingo18 thứ tự quay có ý nghĩa hiển thị, khác `payoutHash`).
 *
 * @param gameKey - Game của kỳ quay.
 * @param drawPeriod - Mã kỳ THEO NGUỒN (chuẩn hoá zero-pad).
 * @param numbers - Số ĐÚNG THỨ TỰ nguồn công bố — KHÔNG sort.
 */
export function computeDisplayHash(gameKey: ResultFeedGameKey, drawPeriod: string, numbers: readonly string[]): string {
  return sha256Hex(`${gameKey}:${drawPeriod}:${numbers.join(",")}`);
}
