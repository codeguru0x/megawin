/**
 * Chuyển một số thứ tự (base-1) thành nhãn chữ cái kiểu bảng tính:
 * `1 -> "A"`, `2 -> "B"`, ..., `26 -> "Z"`, `27 -> "AA"`, `28 -> "AB"`, `703 -> "AAA"`.
 *
 * "base-1" nghĩa là ĐẦU VÀO BẮT ĐẦU TỪ 1 (phần tử thứ nhất = "A"), KHÔNG phải 0.
 * Dùng cho: đánh số board (A, B, C...), hoặc bất kỳ nơi cần thứ tự chữ cái từ số.
 *
 * @param ordinal Số thứ tự, bắt đầu từ 1. Ném RangeError nếu < 1.
 * @returns Nhãn chữ cái in hoa.
 */
export function numberToAlphaLabel(ordinal: number): string {
  if (!Number.isInteger(ordinal) || ordinal < 1) {
    throw new RangeError(`ordinal phải là số nguyên >= 1, nhận: ${ordinal}`);
  }
  let label = "";
  // Hệ đếm "bijective base-26": mỗi vòng lấy 1 chữ cái từ phải sang trái.
  // Trừ 1 để đưa về dải 0..25 rồi cộng 65 (mã ASCII của 'A') ra ký tự.
  // Sau đó chia 26 để xử lý chữ cái hàng cao hơn (AA, AB...).
  let remaining = ordinal;
  while (remaining > 0) {
    const zeroBased = (remaining - 1) % 26; // 0..25
    const letter = String.fromCharCode(65 + zeroBased); // 'A'..'Z'
    label = letter + label;
    remaining = Math.floor((remaining - 1) / 26);
  }
  return label;
}

/**
 * Hàm ngược của {@link numberToAlphaLabel}: `"A" -> 1`, `"Z" -> 26`, `"AA" -> 27`.
 * Trả về số thứ tự **base-1**. Ném RangeError nếu chuỗi rỗng hoặc có ký tự ngoài A-Z.
 *
 * @param label Chuỗi chữ cái in hoa (A-Z).
 * @returns Số thứ tự base-1.
 */
export function alphaLabelToNumber(label: string): number {
  if (!/^[A-Z]+$/.test(label)) {
    throw new RangeError(`label phải là chuỗi A-Z in hoa, nhận: "${label}"`);
  }
  let ordinal = 0;
  for (const ch of label) {
    ordinal = ordinal * 26 + (ch.charCodeAt(0) - 64); // 'A' -> 1 (bijective)
  }
  return ordinal;
}

/**
 * Sinh chuỗi nhãn chữ cái liên tục độ dài `count`: `alphaLabelSequence(3) -> ["A","B","C"]`.
 *
 * @param count Số lượng nhãn (>= 0).
 * @returns Mảng nhãn chữ cái từ "A".
 */
export function alphaLabelSequence(count: number): string[] {
  return Array.from({ length: count }, (_, i) => numberToAlphaLabel(i + 1));
}
