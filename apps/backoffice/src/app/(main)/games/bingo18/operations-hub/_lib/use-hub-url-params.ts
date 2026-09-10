"use client";

/**
 * Ops Hub — URL params (nuqs)
 *
 * Chỉ những gì cần CHIA SẺ ĐƯỢC qua link hoặc sống sót qua F5 (guideline §6.1):
 * `gate` (1 trong 5 tab id của `HubGateTab` — p1-02 §4.1, DUY NHẤT nguồn chân lý tab 5A),
 * `sort`/`dir` (cột sort đang áp, `undefined` = dùng default theo tab — p1-02 §4.2),
 * `focus`/`span` (cửa sổ Focus Rail — Day Flow brush ghi ở p1-01, rail render ở p1-02).
 *
 * ⚠️ KHÔNG còn `stage` riêng (khác bản p1-01 ban đầu) — `hub-overview-section.tsx` từng ghi
 * `gate: SaleGate.xxx` + `stage: OpsStage.xxx` (2 enum RAW, không khớp `HubGateTab`). Đã gộp
 * lại 1 param `gate` duy nhất mang ĐÚNG 1 trong 5 giá trị `HubGateTab` — xem sửa ở file đó.
 *
 * `history: "replace"` (mặc định của nuqs) — không tạo entry mới, không phải "làm rác history"
 * như lo ngại của plan cũ. `clearOnDefault: true` giữ URL sạch khi đang ở giá trị mặc định.
 */

import { parseAsInteger, parseAsString, useQueryStates } from "nuqs";

export function useHubUrlParams() {
  return useQueryStates(
    {
      /** 1 trong 5 giá trị `HubGateTab` (`_lib/sections/queue/queue-types.ts`). */
      gate: parseAsString,
      /** 1 trong `QueueSortKey`; `null` = dùng default theo tab (`defaultSortForTab`). */
      sort: parseAsString,
      /** 1 trong `QueueSortDir`; chỉ có nghĩa khi `sort` đã set. */
      dir: parseAsString,
      /** `drawId` ở giữa cửa sổ Focus Rail / brush Day Flow. */
      focus: parseAsString,
      /** Số card Focus Rail (7-21) — Day Flow overview cũng đọc để biết độ rộng brush. */
      span: parseAsInteger,
    },
    { history: "replace", clearOnDefault: true },
  );
}
