/**
 * Game Core – Vietlott Period Anchor
 *
 * Neo dùng để suy mã kỳ Vietlott (`vietlottRef.drawPeriod`) — dùng CHUNG cho mọi
 * game (Keno, Bingo18, Lotto535, Mega645, Power655, Max3D, Max3DPro). Shape giống
 * nhau tuyệt đối ở cả 7 game — chỉ luật validate `anchorDrawTime` khác theo kiểu
 * lịch của từng game (xử lý ở Zod `.refine()` per-game, không ở đây).
 *
 * Thiết kế đầy đủ: `.cursor/plans/vietlott-period-suggestion/00-overview.md` §4.0.
 */

/**
 * Neo suy mã kỳ Vietlott. Nhận KỲ BẤT KỲ (không bắt buộc kỳ đầu ngày) — staff chỉ
 * copy 3 giá trị đang nhìn thấy trên trang Vietlott cho một kỳ bất kỳ, backend tự
 * quy đổi sang mã kỳ của các kỳ khác. Không đọc `vietlottRef` nào từ DB.
 */
export interface VietlottPeriodAnchor {
  /** Ngày quay của kỳ làm neo, format "YYYY-MM-DD". */
  anchorDrawDate: string;
  /** Giờ quay của kỳ làm neo, format "HH:mm" — phải nằm trên lịch quay của game. */
  anchorDrawTime: string;
  /** Mã kỳ Vietlott của CHÍNH kỳ đó. String để giữ zero-pad (ví dụ "0293483"). */
  anchorPeriod: string;
}
