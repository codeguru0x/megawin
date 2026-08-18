"use client";

/**
 * Hook để một trang "công bố" context runtime cho AI Panel — phần URL không mô tả được.
 *
 * Thiết kế cốt lõi: hook này **KHÔNG gây re-render** ở đâu cả. Nó chỉ ghi 1 hàm đọc vào store
 * module-level (`lib/ai-page-context.ts`); `prepareSend` gọi hàm đó đúng lúc staff bấm Gửi. Nhờ
 * vậy state đổi liên tục (đổi kỳ quay, đổi tab, poll React Query) không kéo theo render nào của
 * AI Panel.
 *
 * Vì sao cần `useEffectEvent`: nếu truyền `value` thẳng vào effect thì mỗi lần đổi kỳ quay là
 * unregister + register lại (deps đổi). `useEffectEvent` cho closure luôn đọc `value` MỚI NHẤT
 * trong khi effect chỉ chạy 1 lần theo `key` — đúng pattern `use-operations.ts` đang dùng.
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

import { useEffect, useEffectEvent } from "react";

import { type AiPageContextValue, registerAiPageContext } from "@/lib/ai-page-context";

/**
 * @param key Định danh khối context (xuất hiện thẳng trong prompt, đặt tên ngắn + có nghĩa:
 *   `"operations"`, `"jackpot"`). Trang khác nhau dùng key khác nhau; trùng key thì ghi đè.
 * @param value Snapshot state hiện tại. Chỉ primitive — xem JSDoc `AiPageContextValue`.
 */
export function useAiPageContext(key: string, value: AiPageContextValue): void {
  const read = useEffectEvent(() => value);

  useEffect(() => registerAiPageContext(key, read), [key]);
}
