/**
 * ResultFeed – Historical Import: Id → drawPeriod
 *
 * `06-historical-import.plan.md §2.2`. Field `id` trong file JSONL lịch sử đại diện cho
 * mã kỳ, nhưng KHÔNG đồng nhất format giữa 7 game — Keno có prefix `#` (`"#0110271"`),
 * các game khác không (`"00001"`, `"0083123"`). `drawPeriod` lưu trong `ObservationDoc`/
 * `ConsensusDoc` PHẢI chỉ gồm chữ số (khớp `parsedObservationSchema.drawPeriod`, regex
 * `^\d+$`) để đồng nhất sort/so sánh giữa các game — dùng 1 hàm DUY NHẤT cho cả 7 game,
 * strip MỌI ký tự không phải chữ số (không riêng `#`), giữ nguyên độ dài zero-pad gốc.
 */

/**
 * Chuẩn hoá `id` nguồn (JSONL lịch sử) sang `drawPeriod` — strip mọi ký tự không phải
 * chữ số, giữ nguyên số lượng digit còn lại (không zero-pad lại, không cắt bớt).
 *
 * @throws {Error} Khi `id` không chứa chữ số nào sau khi strip — dấu hiệu dữ liệu nguồn hỏng.
 */
export function idToDrawPeriod(id: string): string {
  const digits = id.replace(/\D/g, "");
  if (digits.length === 0) {
    throw new Error(`idToDrawPeriod: id "${id}" không chứa chữ số nào sau khi strip.`);
  }
  return digits;
}
