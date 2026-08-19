"use client";

/**
 * Hook để một trang "công bố" context runtime cho AI Panel — phần URL không mô tả được.
 *
 * Thiết kế cốt lõi: hook này **KHÔNG gây re-render** ở đâu cả. Nó chỉ ghi 1 hàm đọc vào store
 * module-level (`lib/ai-page-context.ts`); `prepareSend` gọi hàm đó đúng lúc staff bấm Gửi. Nhờ
 * vậy state đổi liên tục (đổi kỳ quay, đổi tab, poll React Query) không kéo theo render nào của
 * AI Panel.
 *
 * Vì sao ref chứ KHÔNG `useEffectEvent`: contributor phải gọi được ở MỌI pha, kể cả trong render.
 * `navigate-tool-card.tsx` đọc store trong `useState(() => ...)` (snapshot lúc mount) — mà React 19
 * **cấm gọi hàm `useEffectEvent` trong render**. Bản đầu dùng `useEffectEvent` nên contributor
 * throw ở đúng đường đọc đó; `collectAiPageContext` bắt lỗi và BỎ QUA nhóm context ⇒ thẻ điều hướng
 * kết luận "không dirty" và tự kéo staff khỏi form đang sửa dở, trong khi model (đọc ở
 * `prepareSend` — event handler, ngoài render) vẫn thấy dirty. Bug 19/08: thẻ ghi "Đã mở" ngay dưới
 * câu Mira nhắc "form Jackpot đang có thay đổi chưa lưu". Ref không có ràng buộc pha nào.
 *
 * Ghi `ref.current` trong render là CÓ Ý (pattern "store latest value in ref"): giá trị phải mới
 * nhất kể cả khi người đọc là một component khác đang render cùng lượt. Render bị huỷ giữa đường có
 * thể để lại giá trị của lượt chưa commit, nhưng đây là snapshot state hiển thị — lượt render kế
 * tiếp ghi lại ngay, và hệ quả xấu nhất là cảnh báo "chưa lưu" sớm hơn một nhịp (fail-safe, đúng
 * hướng an toàn). Ghi trong `useEffect` thì ngược lại: trễ một nhịp đúng lúc cần chặn nhất.
 *
 * @example
 * ```tsx
 * const { effectiveDrawId, status } = useDrawContext();
 * useAiPageContext("operations", {
 *   drawId: effectiveDrawId,
 *   drawStatus: status,
 * });
 * ```
 */

import { useEffect, useRef } from "react";

import { type AiPageContextValue, registerAiPageContext } from "@/lib/ai-page-context";

/**
 * @param key Định danh khối context (xuất hiện thẳng trong prompt, đặt tên ngắn + có nghĩa:
 *   `"operations"`, `"jackpot"`). Trang khác nhau dùng key khác nhau; trùng key thì ghi đè.
 * @param value Snapshot state hiện tại. Chỉ primitive — xem JSDoc `AiPageContextValue`.
 */
export function useAiPageContext(key: string, value: AiPageContextValue): void {
  const valueRef = useRef(value);
  valueRef.current = value;

  useEffect(() => registerAiPageContext(key, () => valueRef.current), [key]);
}
