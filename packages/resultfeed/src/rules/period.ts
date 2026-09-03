/**
 * ResultFeed – Period Utilities (pure)
 *
 * Mã kỳ (`drawPeriod`) là số tăng dần zero-pad do TỪNG NGUỒN tự quy định độ dài — Vietlott
 * Keno/Bingo18 dùng 7 chữ số (`"0294026"`), nhưng độ dài này KHÔNG được giả định cố định
 * cho mọi game/nguồn: Power 6/55 (hoặc nguồn tương lai) có thể chỉ dùng 5 chữ số.
 */

/**
 * Tăng 1 mã kỳ, GIỮ NGUYÊN độ dài chuỗi gốc — zero-pad width LUÔN lấy từ chính giá trị
 * đang lưu (`period.length`), KHÔNG hardcode số cố định ở bất kỳ đâu. Đây là cách DUY
 * NHẤT đúng cho mọi nguồn: convert về number, +1, convert ngược lại rồi pad theo đúng độ
 * dài input — không phải hằng số như `7`.
 *
 * VD: `"0294026"` (7 chữ số) → `"0294027"`. `"00042"` (5 chữ số) → `"00043"`.
 */
export function incrementPeriod(period: string): string {
  return String(Number(period) + 1).padStart(period.length, "0");
}
