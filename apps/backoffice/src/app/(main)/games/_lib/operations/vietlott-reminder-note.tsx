import { cn } from "@/lib/utils";

/**
 * Ghi chú nhắc đối chiếu mã kỳ Vietlott — hiển thị ở cuối phần "Tham chiếu Vietlott"
 * trong dialog công bố/sửa kết quả. Giá trị gợi ý (nếu có) chỉ để so sánh, KHÔNG phải giá trị
 * chắc chắn đúng — staff vẫn phải tự đối chiếu với trang Vietlott trước khi lưu.
 *
 * `mt-3` là margin MẶC ĐỊNH — phần tử phía trên (box "không suy được"/"lệch gợi ý") là
 * conditional, không có mặt lúc nào cũng phải có khoảng cách với input phía trên, nếu để
 * caller tự thêm margin thì dễ quên ở 1-2/7 game (đã xảy ra thực tế). Keno (P09) override
 * xuống `mt-2` qua prop `className` vì đặt ngay sau `VietlottResultPanel` (đã tự có
 * `py-2.5` riêng, không cần khoảng cách lớn) — 6 game còn lại (giai đoạn 2, chưa làm) vẫn
 * dùng mặc định `mt-3`, KHÔNG bị breaking.
 *
 * Bỏ icon `AlertTriangle` + giảm còn `text-[11px]` so với trước (P09 §6.6) — nhắc nhở tĩnh
 * luôn hiện, phải nhẹ nhất về thị giác trong khối "Tham chiếu Vietlott", không tranh
 * attention với `VietlottResultPanel` (khối trạng thái động, quan trọng hơn).
 *
 * Dùng CHUNG cho dialog công bố/sửa kết quả của TẤT CẢ 7 game.
 */
export function VietlottReminderNote({ className }: { className?: string }) {
  return (
    <p className={cn("mt-3 text-[11px] text-muted-foreground/80", className)}>
      Luôn đối chiếu mã kỳ với trang Vietlott trước khi lưu — giá trị gợi ý (nếu có) chỉ để so sánh, không phải giá trị
      chắc chắn đúng.
    </p>
  );
}
