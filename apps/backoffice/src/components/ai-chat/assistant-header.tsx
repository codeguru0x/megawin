"use client";

/**
 * AI Chat — header của lượt trả lời: avatar + tên trợ lý + tín hiệu trạng thái.
 *
 * VÌ SAO CÓ TÍN HIỆU Ở ĐÂY (feedback 17/08): trước đây dấu hiệu "agent đang làm việc" chỉ đến từ
 * card tool (`Đang chạy`) và `Reasoning` — hai thứ ta đang chủ động ẩn khỏi staff. Ẩn xong thì
 * khoảng từ lúc bấm gửi tới lúc chữ đầu tiên hiện ra trở thành im lặng hoàn toàn, staff không phân
 * biệt được "đang xử lý" với "treo".
 *
 * BA PHA (đổi 19/08, tinh chỉnh tới lần 5):
 * - **Đang làm việc** (lượt đang chạy, KHÔNG phải lúc chữ đang chảy) → `LiveDot`: dot màu primary
 *   nhấp nháy, CÙNG HÀNG với tên trợ lý, KHÔNG CHỮ, KHÔNG SỐ GIÂY. Bản cũ hiện "Đang suy nghĩ…
 *   N giây" và chính con số tăng dần mỗi giây là thứ làm staff sốt ruột — nó đếm to thời gian chờ mà
 *   không giúp họ quyết định gì.
 * - **Đang viết** (part CUỐI là text, tức chữ đang chảy ra) → KHÔNG hiện gì. Chữ đang hiện ra tự nó
 *   đã là tín hiệu sống rõ hơn mọi indicator; giữ dot lúc này chỉ là nhiễu cạnh tên.
 * - **Đã xong** → chữ "Đã xử lý trong N giây": lúc này con số mới có ích, để staff đối chiếu câu nào
 *   tra nặng (quyết định sản phẩm 17/08, giữ nguyên). Nó cũng thay vai trò "bằng chứng agent có làm
 *   việc" mà card tool từng đảm nhiệm.
 *
 * ⚠️ PHA "đang làm việc" KHÔNG PHẢI CHỈ ĐOẠN ĐẦU LƯỢT (sửa 23/08, feedback ảnh 1): bản trước tính
 * `isThinking = isActive && chưa có chữ nào`, nên khi Mira viết một câu mở đầu ("Tra doanh thu từng
 * ngày…") rồi mới đi gọi tool, dot tắt VĨNH VIỄN dù agent còn tra 50 giây nữa — staff đọc như "trả
 * lời xong rồi" và bỏ đi. Điều kiện đúng là "đang chạy VÀ chữ KHÔNG đang chảy" (xem
 * `render-message.tsx`: part cuối không phải text) ⇒ dot QUAY LẠI mỗi khi agent rời chữ đi tra tool.
 *
 * Cả ba pha dùng ĐÚNG một vị trí (cuối hàng tên) nên không có gì nhảy chỗ giữa các pha.
 *
 * Đo từ MỐC TURN (`turnStartedAt` do `ChatPanel` giữ) chứ không từ lúc message assistant xuất hiện:
 * message assistant chỉ tồn tại sau khi server trả part đầu, nên đo theo nó sẽ hụt 1-3 giây đầu.
 */

import { useEffect, useRef, useState } from "react";

import { SparklesIcon } from "lucide-react";

import { LiveDot } from "@/components/ai-elements/live-indicator";
import { AI_ASSISTANT_NAME } from "@/config/app-config";

const MS_IN_S = 1000;

/**
 * Tín hiệu cuối hàng tên trợ lý: `LiveDot` khi đang "suy nghĩ" → "· Đã xử lý trong N giây" khi xong.
 *
 * MỘT vị trí cho cả hai pha (đổi 19/08 lần 3): bản trước đưa dot xuống vùng nội dung, nó đứng lơ
 * lửng một mình dưới tên và đọc như bullet lỗi của câu trả lời, lại còn khiến chữ thời lượng "mọc"
 * ở chỗ khác lúc xong. Gắn cả hai vào cuối hàng tên thì dot tắt — chữ hiện đúng chỗ dot vừa đứng.
 *
 * ⚠️ `isThinking` VÀ `isActive` LÀ HAI THỨ KHÁC NHAU, KHÔNG ĐƯỢC GỘP:
 * - `isThinking` (hiện dot) tắt CHỈ trong lúc chữ đang chảy ra — lúc đó chữ tự nó là tín hiệu sống,
 *   dot thành nhiễu (feedback 19/08 lần 4). Chữ ngừng chảy mà lượt chưa xong (agent đi gọi tool) thì
 *   dot BẬT LẠI (feedback 23/08 ảnh 1) — nếu không, câu mở đầu của Mira sẽ trông như câu trả lời
 *   cuối cùng trong suốt thời gian tra tool.
 * - `isActive` (đang trong lượt) chạy tới hết lượt, và là mốc DUY NHẤT được dùng để chốt tổng thời
 *   gian. Nếu chốt tổng theo `isThinking` thì "Đã xử lý trong N giây" hiện ra ngay khi Mira mới viết
 *   được một chữ — đọc như câu trả lời đã xong trong lúc còn đang chảy (đúng hình dạng bug 19/08).
 *
 * Giữa hai pha (`isActive` còn true, `isThinking` đã false) chỗ này KHÔNG render gì — đó là chủ ý.
 *
 * Sau khi xong KHÔNG biến mất mà chốt lại con số (quyết định sản phẩm 17/08): staff cần đối chiếu
 * câu nào tra lâu để biết truy vấn nào nặng.
 *
 * ⚠️ `isActive` PHẢI phản ánh "message NÀY thuộc lượt đang chạy", và `ChatPanel` xác định điều đó
 * bằng cách so `id`/số part với ảnh chụp lúc lượt bắt đầu (`resolveActiveAssistantId`). Hai cách suy
 * đã hỏng trong thực tế, đừng quay lại:
 * - Theo VỊ TRÍ trong mảng (bug 18/08): message đã xong của lượt trước bị flip true→false thêm một
 *   lần khi staff gửi câu tiếp theo — nhánh chốt tổng dưới đây chạy lại với mốc của LƯỢT MỚI và ghi
 *   đè "17 giây" thành "1 giây".
 * - Theo `metadata.status === "streaming"` (bug 19/08): reducer eve đổi status theo từng part, nên
 *   giữa lượt nó nhảy `complete` → `streaming` mỗi lần Mira viết xong một đoạn text ⇒ dòng này chốt
 *   tổng giữa lúc còn đang trả lời (đọc như câu trả lời bị đứt) rồi lại bắt đầu lại.
 *
 * Tổng thời gian chỉ sống trong state của component ⇒ reload trang hoặc resume thread từ storage
 * thì mất, lúc đó không render gì. CHẤP NHẬN: con số này là tín hiệu tức thời cho lượt vừa chạy,
 * không phải dữ liệu cần persist — lưu nó đòi metadata message do server ghi, không đáng cho một
 * nhãn phụ.
 */
function AssistantActivityLine({
  isActive,
  isThinking,
  turnStartedAt,
}: {
  /** Lượt này đang chạy (status `submitted`/`streaming`) — mốc chốt tổng thời gian. */
  isActive: boolean;
  /** Đang chạy VÀ chữ KHÔNG đang chảy (chưa viết gì, hoặc đã viết xong đoạn và đi gọi tool). */
  isThinking: boolean;
  /**
   * Mốc `Date.now()` lúc lượt bắt đầu.
   *
   * Parent KHÔNG reset về `null` khi lượt xong (nó vẫn là mốc của lượt vừa chạy); `null` chỉ xảy ra
   * khi panel chưa chạy lượt nào — vd message lịch sử resume từ storage.
   */
  turnStartedAt: number | null;
}) {
  // Ref giữ mốc bắt đầu để lúc `isActive` tắt vẫn tính được tổng — prop `turnStartedAt` lúc đó đã
  // là mốc của lượt KHÁC (parent đặt mốc mới khi staff gửi câu tiếp theo), không dùng được.
  const startedAtRef = useRef<number | null>(null);
  const [totalSeconds, setTotalSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (isActive) {
      if (startedAtRef.current === null) {
        // `turnStartedAt` là mốc chuẩn; `Date.now()` chỉ là lối thoát khi component mount muộn hơn
        // lượt (vd message cũ bị đánh dấu active sau khi resume).
        startedAtRef.current = turnStartedAt ?? Date.now();
      }
      return;
    }
    if (startedAtRef.current !== null) {
      // `max(1, …)` để lượt dưới 1 giây không hiện "Đã xử lý trong 0 giây" (đọc như lỗi).
      setTotalSeconds(Math.max(1, Math.round((Date.now() - startedAtRef.current) / MS_IN_S)));
      startedAtRef.current = null;
    }
  }, [isActive, turnStartedAt]);

  if (isThinking) {
    return <LiveDot />;
  }
  if (isActive) {
    // Đang chảy chữ: chữ tự nó là tín hiệu sống. Cũng CHƯA được chốt tổng ở đây.
    return null;
  }
  if (totalSeconds !== null) {
    return <span>· Đã xử lý trong {totalSeconds} giây</span>;
  }
  return null;
}

/**
 * Hàng nhận diện trợ lý, đứng trên nội dung của mọi message assistant.
 *
 * Cũng dùng cho message assistant "chưa tồn tại" (`ChatPanel` render stub lúc vừa gửi) — nhờ vậy
 * khung hội thoại không nhảy layout khi message thật tới: cùng một hàng header, chỉ đổi phần thân.
 */
export function AssistantHeader({
  isActive,
  isThinking = isActive,
  turnStartedAt,
}: {
  /** Message này thuộc lượt đang chạy — điều khiển việc chốt tổng thời gian. */
  isActive: boolean;
  /**
   * Đang chạy VÀ chữ không đang chảy ⇒ hiện `LiveDot`. Mặc định bằng `isActive` cho chỗ đứng chưa
   * có message thật (`PendingAssistantTurn`), nơi hai điều kiện luôn trùng nhau.
   */
  isThinking?: boolean;
  turnStartedAt: number | null;
}) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground text-xs">
      <span className="flex size-5 items-center justify-center rounded-full bg-primary/10">
        <SparklesIcon className="size-3 text-primary" />
      </span>
      {AI_ASSISTANT_NAME}
      <AssistantActivityLine isActive={isActive} isThinking={isThinking} turnStartedAt={turnStartedAt} />
    </div>
  );
}
