import { AlertTriangle } from "lucide-react";

/**
 * Ghi chú nhắc đối chiếu mã kỳ Vietlott — hiển thị ở cuối phần "Tham chiếu Vietlott"
 * trong dialog công bố/sửa kết quả. Dùng icon warning (KHÔNG dùng icon settings) để thu
 * hút chú ý: giá trị gợi ý (nếu có) chỉ để so sánh, KHÔNG phải giá trị chắc chắn đúng —
 * staff vẫn phải tự đối chiếu với trang Vietlott trước khi lưu.
 *
 * `mt-3` nằm SẴN trong component — phần tử phía trên (box "không suy được"/"lệch gợi ý")
 * là conditional, không có mặt lúc nào cũng phải có khoảng cách với input phía trên, nếu
 * để caller tự thêm margin thì dễ quên ở 1-2/7 game (đã xảy ra thực tế).
 *
 * Dùng CHUNG cho dialog công bố/sửa kết quả của TẤT CẢ 7 game.
 */
export function VietlottReminderNote() {
  return (
    <div className="mt-3 flex items-start gap-1.5">
      <AlertTriangle className="size-3 text-amber-600 dark:text-amber-400 shrink-0 mt-0.5" />
      <p className="text-xs text-muted-foreground">
        Luôn đối chiếu mã kỳ với trang Vietlott trước khi lưu — giá trị gợi ý (nếu có) chỉ để so sánh, không phải giá
        trị chắc chắn đúng.
      </p>
    </div>
  );
}
