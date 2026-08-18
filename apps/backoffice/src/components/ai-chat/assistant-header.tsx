"use client";

/**
 * AI Chat — header của lượt trả lời: avatar + tên trợ lý + dòng trạng thái đếm giây.
 *
 * VÌ SAO CÓ DÒNG TRẠNG THÁI Ở ĐÂY (feedback 17/08): trước đây tín hiệu "agent đang làm việc" chỉ
 * đến từ card tool (`Đang chạy`) và `Reasoning` — hai thứ ta đang chủ động ẩn khỏi staff. Ẩn xong
 * thì khoảng thời gian từ lúc bấm gửi tới lúc chữ đầu tiên hiện ra trở thành im lặng hoàn toàn,
 * staff không phân biệt được "đang xử lý" với "treo". Dòng đếm giây cạnh tên Mira là tín hiệu
 * KHÔNG phụ thuộc nội thất agent: nó chỉ nói "còn đang làm, đã N giây", không hé ra đang gọi tool
 * gì.
 *
 * Đo từ MỐC TURN (`turnStartedAt` do `ChatPanel` giữ) chứ không từ lúc message assistant xuất hiện:
 * message assistant chỉ tồn tại sau khi server trả part đầu, nên đo theo nó sẽ mất 1-3 giây đầu —
 * đúng khoảng staff sốt ruột nhất.
 */

import { useEffect, useRef, useState } from "react";

import { SparklesIcon } from "lucide-react";

import { Shimmer } from "@/components/ai-elements/shimmer";
import { useElapsedSeconds } from "@/components/ai-elements/use-elapsed-seconds";
import { AI_ASSISTANT_NAME } from "@/config/app-config";

const MS_IN_S = 1000;

/**
 * Dòng trạng thái cạnh tên trợ lý.
 *
 * Sau khi xong KHÔNG biến mất mà chốt lại "Đã xử lý trong N giây" (quyết định sản phẩm 17/08):
 * staff cần đối chiếu câu nào tra lâu để biết truy vấn nào nặng, và con số này thay luôn vai trò
 * "bằng chứng agent có làm việc" mà card tool từng đảm nhiệm.
 *
 * ⚠️ `isActive` PHẢI phản ánh trạng thái của CHÍNH message này (`metadata.status === "streaming"`),
 * KHÔNG phải "là message cuối mảng". Bug 18/08: `ChatPanel` suy `isActive` theo vị trí, nên message
 * đã xong của lượt trước bị flip true→false một lần nữa khi staff gửi câu tiếp theo — nhánh chốt
 * tổng dưới đây chạy lại với mốc của LƯỢT MỚI và ghi đè "17 giây" thành "1 giây".
 *
 * Tổng thời gian chỉ sống trong state của component ⇒ reload trang hoặc resume thread từ storage
 * thì mất, lúc đó không render gì. CHẤP NHẬN: con số này là tín hiệu tức thời cho lượt vừa chạy,
 * không phải dữ liệu cần persist — lưu nó đòi metadata message do server ghi, không đáng cho một
 * nhãn phụ.
 */
function AssistantActivityLine({
  hasText,
  isActive,
  turnStartedAt,
}: {
  /** Đã có part text ⇒ đang viết câu trả lời, không còn là "suy nghĩ". */
  hasText: boolean;
  /** Lượt này đang chạy (status `submitted`/`streaming`). */
  isActive: boolean;
  /** Mốc `Date.now()` lúc lượt bắt đầu; `null` khi không phải lượt đang chạy. */
  turnStartedAt: number | null;
}) {
  // Ref giữ mốc bắt đầu để lúc `isActive` tắt vẫn tính được tổng — prop `turnStartedAt` lúc đó đã
  // là mốc của lượt KHÁC (parent đặt mốc mới khi staff gửi câu tiếp theo), không dùng được.
  const startedAtRef = useRef<number | null>(null);
  const [activeStartedAt, setActiveStartedAt] = useState<number | null>(null);
  const [totalSeconds, setTotalSeconds] = useState<number | null>(null);

  useEffect(() => {
    if (isActive) {
      if (startedAtRef.current === null) {
        // `turnStartedAt` là mốc chuẩn; `Date.now()` chỉ là lối thoát khi component mount muộn hơn
        // lượt (vd message cũ bị đánh dấu active sau khi resume).
        const start = turnStartedAt ?? Date.now();
        startedAtRef.current = start;
        setActiveStartedAt(start);
      }
      return;
    }
    if (startedAtRef.current !== null) {
      // `max(1, …)` để lượt dưới 1 giây không hiện "Đã xử lý trong 0 giây" (đọc như lỗi).
      setTotalSeconds(Math.max(1, Math.round((Date.now() - startedAtRef.current) / MS_IN_S)));
      startedAtRef.current = null;
      setActiveStartedAt(null);
    }
  }, [isActive, turnStartedAt]);

  const elapsedSeconds = useElapsedSeconds(activeStartedAt);

  if (isActive) {
    // Đổi động từ theo pha: gọi giai đoạn đang đổ chữ là "suy nghĩ" thì mâu thuẫn với những gì
    // staff đang thấy trên màn hình.
    const label = hasText ? "Đang trả lời" : "Đang suy nghĩ";
    // `as="span"`: `Shimmer` mặc định render `<p>` (block) ⇒ nhãn bị đẩy xuống dòng riêng, tách
    // khỏi tên Mira và làm hàng header cao gấp đôi.
    return <Shimmer as="span" duration={1}>{`· ${label}… ${elapsedSeconds} giây`}</Shimmer>;
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
  hasText,
  isActive,
  turnStartedAt,
}: {
  hasText: boolean;
  isActive: boolean;
  turnStartedAt: number | null;
}) {
  return (
    <div className="flex items-center gap-2 text-muted-foreground text-xs">
      <span className="flex size-5 items-center justify-center rounded-full bg-primary/10">
        <SparklesIcon className="size-3 text-primary" />
      </span>
      {AI_ASSISTANT_NAME}
      <AssistantActivityLine hasText={hasText} isActive={isActive} turnStartedAt={turnStartedAt} />
    </div>
  );
}
