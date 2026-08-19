/**
 * AI Elements — chỉ báo "đang xử lý": MỘT dot màu, cùng hàng với tên trợ lý.
 *
 * VÌ SAO KHÔNG DÙNG CHỮ + ĐỒNG HỒ (feedback 19/08): dòng "Đang suy nghĩ… 14 giây" biến thời gian
 * chờ thành một con số tăng dần đập vào mắt staff mỗi giây — đúng thứ khiến việc chờ trở nên SỐT
 * RUỘT thay vì được trấn an. Con số đó cũng không giúp staff quyết định gì trong lúc chờ (không huỷ
 * lượt nhanh hơn, không hỏi lại sớm hơn). Tổng thời lượng chỉ có ích SAU KHI xong, để đối chiếu câu
 * nào tra nặng — nên nó vẫn được giữ, chỉ chuyển sang chốt một lần lúc kết thúc
 * (`assistant-header.tsx`).
 *
 * VÌ SAO MỘT DOT, KHÔNG HAI TÍN HIỆU (feedback 19/08 lần 2): bản đầu có dot cạnh tên Mira VÀ ba dot
 * ở vùng nội dung — hai thứ nói CÙNG một điều ở hai chỗ, mắt không biết nhìn đâu.
 *
 * VÌ SAO Ở HÀNG TÊN, KHÔNG Ở VÙNG NỘI DUNG (feedback 19/08 lần 3): thử đặt một dot to ở vùng nội
 * dung thì nó đứng lơ lửng một mình dưới tên, đọc như một bullet lỗi của câu trả lời hơn là chỉ báo
 * trạng thái. Đặt cùng hàng với "Mira" thì nó gắn vào ĐÚNG chủ thể đang làm việc — cùng chỗ mà lát
 * nữa hiện "· Đã xử lý trong N giây", nên không có gì nhảy chỗ khi lượt kết thúc.
 *
 * Hệ quả kỹ thuật đáng giá: bỏ đồng hồ tick nghĩa là bỏ luôn một `setInterval` re-render cả cây
 * message MỖI GIÂY trong suốt lượt. Animation ở đây thuần CSS, chạy trên compositor, không tốn một
 * lần render React nào.
 *
 * A11Y: `role="status"` kèm nhãn `sr-only` — người dùng screen reader vẫn được thông báo "đang xử
 * lý" dù tín hiệu thị giác là animation. `motion-safe:` để `prefers-reduced-motion` tắt animation mà
 * dot vẫn hiển thị (tín hiệu không biến mất, chỉ thôi nhấp nháy).
 */

import { cn } from "@/lib/utils";

/**
 * Dot "đang chạy" — đặt CUỐI hàng tên trợ lý, cùng dòng với "Mira".
 *
 * `bg-primary` (không `bg-foreground`): đây là tín hiệu SỐNG, cần bật ra khỏi hàng chữ xám của
 * header. Bản trước dùng màu chữ nên ở 6px gần như không thấy; màu thương hiệu ở 10px thì thấy ngay
 * mà không cần phóng to thành một khối tranh chú ý với text.
 *
 * Hai lớp: `animate-ping` (vòng loang ra rồi mờ) + dot đặc ở giữa. Vòng loang cho cảm giác "đang
 * phát" liên tục, khác hẳn `animate-pulse` đơn thuần (chỉ mờ-rõ, dễ bị đọc là hiệu ứng trang trí).
 */
export function LiveDot({ className }: { className?: string }) {
  return (
    <span className={cn("relative flex size-2.5 items-center justify-center", className)} role="status">
      <span className="absolute inline-flex size-full rounded-full bg-primary/60 motion-safe:animate-ping" />
      <span className="relative inline-flex size-2.5 rounded-full bg-primary" />
      <span className="sr-only">Đang xử lý</span>
    </span>
  );
}
