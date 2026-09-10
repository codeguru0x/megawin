"use client";

/**
 * Hiện thời lượng trôi theo giây (`treo 47ph12s`) mà KHÔNG re-render React.
 *
 * Ghi `textContent` qua ref trong 1 interval DÙNG CHUNG cấp trang (`interval-registry.ts`)
 * — không phải mỗi ô một `setInterval` (200 dòng × 1 interval = 200 timer).
 *
 * Format mặc định là `formatDurationCompact` (`@megawin/shared/utils`) — trước p1-05 file này
 * tự khai `formatDurationShort` dùng `g`/`p`, lệch phương ngữ với `calcRelativeTime` (`h`/`ph`)
 * cũng đang hiện trên cùng trang. Đã bỏ, dùng chung 1 hàm ở shared.
 *
 * Tiền lệ trong repo: `LastUpdatedBadge` (`keno/operations/page.tsx:46-61`).
 */

import { useEffect, useRef } from "react";

import { formatDurationCompact } from "@megawin/shared/utils";

import { registerCounter } from "./interval-registry";

export function RelativeDuration({
  sinceMs,
  format = formatDurationCompact,
  className,
}: {
  sinceMs: number;
  format?: (elapsedSec: number) => string;
  className?: string;
}) {
  const spanRef = useRef<HTMLSpanElement>(null);

  useEffect(() => {
    const el = spanRef.current;
    if (el === null) {
      return undefined;
    }
    return registerCounter(el, sinceMs, format);
  }, [sinceMs, format]);

  return <span ref={spanRef} className={className} />;
}
