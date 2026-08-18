"use client";

/**
 * Đồng hồ đếm giây trôi qua kể từ `startedAt`, tick mỗi giây.
 *
 * Dùng cho mọi nhãn "đang xử lý… N giây" trong chat (header lượt trả lời, `Reasoning`) — đó là tín
 * hiệu DUY NHẤT cho staff biết agent còn sống trong lúc chờ, nên phải nhích thật chứ không được là
 * một câu tĩnh.
 *
 * ĐẶT HOOK Ở COMPONENT LÁ: mỗi tick là một `setState`, nên component nào gọi hook này sẽ re-render
 * mỗi giây. Gọi ở tầng cao (`ChatPanel`) sẽ re-render toàn bộ hội thoại 1 lần/giây — với thread dài
 * là hàng chục `Streamdown` cùng render lại. Chỉ gọi trong component nhỏ chỉ chứa cái nhãn.
 */

import { useEffect, useState } from "react";

const MS_IN_S = 1000;

/**
 * @param startedAt - Mốc `Date.now()` lúc bắt đầu, hoặc `null` để dừng đếm (trả về 0).
 * @returns Số giây đã trôi qua, làm tròn xuống. `0` khi `startedAt === null` hoặc chưa đủ 1 giây.
 */
export function useElapsedSeconds(startedAt: number | null): number {
  const [elapsed, setElapsed] = useState(0);

  useEffect(() => {
    if (startedAt === null) {
      setElapsed(0);
      return;
    }
    const tick = () => {
      setElapsed(Math.floor((Date.now() - startedAt) / MS_IN_S));
    };
    // Tick ngay: nếu `startedAt` là mốc quá khứ (message resume, hoặc effect chạy trễ) thì chờ tới
    // interval đầu mới hiện số sẽ nhảy vọt từ 0 lên giá trị lớn.
    tick();
    const interval = setInterval(tick, MS_IN_S);
    return () => clearInterval(interval);
  }, [startedAt]);

  return elapsed;
}
