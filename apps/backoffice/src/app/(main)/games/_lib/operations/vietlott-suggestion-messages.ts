import { VietlottSuggestionUnavailableReason } from "@megawin/game-core/utils";

/**
 * Thông báo cho từng lý do không suy được mã kỳ Vietlott (overview §7.1) — 4 nguyên
 * nhân khác nhau đòi hỏi việc khác nhau, KHÔNG gộp thành 1 câu chung chung.
 *
 * Dùng CHUNG cho dialog công bố/sửa kết quả của TẤT CẢ 7 game (Keno, Bingo18, Lotto 5/35,
 * Mega 6/45, Power 6/55, Max 3D, Max 3D Pro) — trước đây constant này bị lặp lại y nguyên
 * ở từng `publish-result-action.tsx`, sửa 1 chỗ phải nhớ sửa 7 chỗ.
 */
export const VIETLOTT_SUGGESTION_UNAVAILABLE_MESSAGES: Record<VietlottSuggestionUnavailableReason, string> = {
  [VietlottSuggestionUnavailableReason.NoAnchor]: "Chưa cấu hình mã kỳ Vietlott trong cấu hình game.",
  [VietlottSuggestionUnavailableReason.BeforeAnchorDate]:
    "Kỳ này trước ngày cấu hình — không suy được mã kỳ Vietlott. Nhập tay, hoặc đổi mã kỳ Vietlott về mốc sớm hơn.",
  [VietlottSuggestionUnavailableReason.OffGrid]:
    "Giờ quay kỳ này không nằm trên lịch chuẩn (có thể do sửa giờ tay, hoặc ngày quay không thuộc lịch quay hiện tại) — không suy được mã kỳ Vietlott, vui lòng nhập tay.",
  [VietlottSuggestionUnavailableReason.ScheduleChangedSinceAnchor]:
    "Lịch quay đã đổi sau ngày cấu hình — mã kỳ Vietlott cũ không còn hiệu lực, cần cập nhật mã kỳ Vietlott ở cấu hình game.",
};
