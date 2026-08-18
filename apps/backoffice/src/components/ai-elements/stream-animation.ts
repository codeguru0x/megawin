/**
 * AI Chat — hiệu ứng "đang viết tiếp" cho text stream vào: fade-in TỪNG TỪ, lệch pha nhẹ (như
 * ChatGPT/Claude). Dùng chung cho câu trả lời (`ai-elements/message.tsx`) và phần suy nghĩ
 * (`ai-elements/reasoning.tsx`) — hai chỗ đó nằm liền nhau trong cùng một message, lệch tham số là
 * thấy ngay bằng mắt.
 *
 * VÌ SAO CẦN (bug thật, sửa 17/08): trước đây prop `animated` không bao giờ được truyền nên bên trong
 * streamdown biến `animatePlugin` là `null` ⇒ plugin KHÔNG được tạo. Không có plugin, streamdown đẩy
 * mỗi lần cập nhật block qua `startTransition` — React được phép dồn nhiều chunk vào một commit, nên
 * chữ hiện ra thành từng cục và cảm giác "giật". Có plugin thì nó set state đồng bộ theo từng chunk,
 * phần mượt do animation lo. Đây cũng là lý do `import "streamdown/styles.css"` từng là no-op.
 *
 * KHÔNG cần tự tắt khi mở lại hội thoại cũ: streamdown chỉ nạp animate plugin khi `animated` VÀ
 * `isAnimating` cùng bật, nên message trong lịch sử (`isAnimating === false`) render tức thì, không
 * fade lại từ đầu.
 *
 * Ai bật "giảm chuyển động" ở OS thì `@media (prefers-reduced-motion: reduce)` trong `globals.css`
 * tắt hẳn keyframes — chữ hiện ngay.
 */

import type { AnimateOptions } from "streamdown";

/**
 * Tham số truyền vào prop `animated` của `Streamdown` (mặc định của lib: 150ms / stagger 40ms / word).
 *
 * - `sep: "word"` — KHÔNG dùng `"char"`: char-level sinh một `<span>` cho MỖI ký tự, câu trả lời dài
 *   kèm bảng số liệu sẽ phình DOM lên hàng chục nghìn node, cuộn bị đứng. Mắt đọc theo từ nên fade
 *   theo từ vẫn thấy liền mạch.
 * - `stagger: 10` (mặc định lib là 40) — đo thật 17/08 trên câu trả lời ~1.400 ký tự: model trả dồn
 *   từng cụm lớn (có render mang hơn 120 từ mới cùng lúc), nên với 18ms thì từ cuối bị hoãn 2,2s và
 *   p90 là 1,7s — chữ "bò" chậm hơn dữ liệu đã về, staff phải chờ mới đọc hết. 10ms ≈ 100 từ/giây,
 *   vẫn thấy chữ hiện dần theo nhịp nhưng không tụt lại sau model.
 * - `duration: 220` + `ease-out` — thời gian fade của TỪNG từ (chạy song song, không cộng dồn): đủ để
 *   thấy hiện dần thay vì bật ra, và ngắn hơn nhịp chunk nên không bị chồng lớp.
 */
export const STREAM_TEXT_ANIMATION = {
  animation: "fadeIn",
  duration: 220,
  easing: "ease-out",
  sep: "word",
  stagger: 10,
} as const satisfies AnimateOptions;
