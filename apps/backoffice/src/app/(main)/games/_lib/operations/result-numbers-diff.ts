/**
 * So sánh 2 mảng số theo VỊ TRÍ (positional diff) — dùng để highlight lệch giữa số đang
 * nhập tay (form) và số nguồn tham chiếu (ResultFeed/Vietlott) trên lưới nhập kết quả.
 *
 * Generic theo `string[]` — KHÔNG biết gì về `gameKey`, KHÔNG tự pad số, KHÔNG tự cắt slice
 * theo nhóm giải (Đặc biệt/Nhất/Nhì/Ba, số chính/số đặc biệt/bonus...). Caller PHẢI tự
 * chuẩn hoá (`padStart` theo đúng độ dài số của game — Keno 2 chữ số, max3d/max3dpro 3 chữ
 * số) và tự cắt đúng slice TRƯỚC khi gọi — xem
 * `.cursor/plans/resultfeed/09-result-autofill-ux-redesign.plan.md` §11 cho bảng slice từng
 * game. Game nhiều nhóm số (lotto535, power655, max3d, max3dpro) gọi hàm này NHIỀU LẦN, mỗi
 * nhóm 1 lần — không gộp thành 1 mảng phẳng rồi so 1 lần.
 *
 * QUY TẮC BẤT BIẾN (plan §5.0/§11.0 — áp dụng cho MỌI game, không riêng Keno): ô rỗng ở
 * `current` LUÔN tính là lệch, không có nhánh bỏ qua "chưa nhập nên chưa biết". Form điền dở
 * (1 số ô đã có, số khác vẫn rỗng) phải thấy đúng số ô còn thiếu/khác — không đánh lừa người
 * dùng bằng con số nhỏ hơn thực tế. KHÔNG thêm tham số/flag "bỏ qua rỗng" vào hàm này.
 */

/** Kết quả so sánh số đang nhập với số nguồn tham chiếu trả về. */
export interface ResultNumbersDiff {
  /** Tập index (0-based) có giá trị khác nhau giữa 2 mảng — bao gồm cả index mà `current` đang rỗng. */
  diffIndices: Set<number>;
  /** Số ô lệch — dùng hiện `"3/20 số khác"`. */
  diffCount: number;
  /** `true` khi 2 mảng khớp hoàn toàn mọi vị trí (không ô nào lệch, không ô nào rỗng). */
  isIdentical: boolean;
  /**
   * `true` khi có lệch vị trí (`diffCount > 0`) NHƯNG cùng TẬP số — chỉ khác THỨ TỰ quay
   * (lệch NHẸ: nhiều game tính giải theo tập số, thứ tự chỉ ảnh hưởng hiển thị).
   * Luôn `false` khi `current` có bất kỳ ô rỗng nào — so tập số với dữ liệu thiếu là vô nghĩa.
   */
  sameSetDifferentOrder: boolean;
}

export function diffResultNumbers(current: string[], incoming: string[]): ResultNumbersDiff {
  const diffIndices = new Set<number>();
  const length = Math.max(current.length, incoming.length);

  for (let i = 0; i < length; i++) {
    // Ô rỗng/thiếu ở `current` tính là LỆCH — không có nhánh bỏ qua (quy tắc bất biến §5.0).
    const currentValue = current[i]?.trim() ?? "";
    const incomingValue = incoming[i]?.trim() ?? "";
    if (currentValue !== incomingValue) {
      diffIndices.add(i);
    }
  }

  const diffCount = diffIndices.size;
  const isIdentical = diffCount === 0;

  // Chỉ tính "cùng tập số khác thứ tự" khi KHÔNG có ô rỗng nào ở current — so tập số với
  // dữ liệu còn thiếu chắc chắn khác tập (thiếu phần tử), kết luận đó vô nghĩa với người dùng.
  const hasEmptyCurrent = current.some((n) => !n.trim());
  const sameSetDifferentOrder = !isIdentical && !hasEmptyCurrent && arraysEqualIgnoringOrder(current, incoming);

  return { diffIndices, diffCount, isIdentical, sameSetDifferentOrder };
}

function arraysEqualIgnoringOrder(a: string[], b: string[]): boolean {
  // Early length check (react-best-practices §7.7) — mảng khác độ dài chắc chắn khác tập,
  // tránh tốn chi phí sort khi không cần.
  if (a.length !== b.length) {
    return false;
  }
  // `toSorted()` không mutate mảng gốc (react-best-practices §7.12) — `current`/`incoming`
  // có thể là state React, `sort()` tại chỗ sẽ phá immutability.
  const sortedA = a.map((n) => n.trim()).toSorted();
  const sortedB = b.map((n) => n.trim()).toSorted();
  for (let i = 0; i < sortedA.length; i++) {
    if (sortedA[i] !== sortedB[i]) {
      return false;
    }
  }
  return true;
}
