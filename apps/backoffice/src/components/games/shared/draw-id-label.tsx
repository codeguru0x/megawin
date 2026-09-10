"use client";

/**
 * Shared – Nhãn mã kỳ quay (`drawId`) cho UI vận hành mật độ cao.
 *
 * Vấn đề nó giải quyết: Keno/Bingo18 mở ~120 kỳ/ngày và Ops Hub hiển thị **kỳ tồn từ nhiều
 * ngày** cùng lúc. Chỉ ghi `#15` thì hai kỳ `2026-09-06.015` và `2026-09-07.015` trông y hệt
 * nhau — staff có thể đóng bán sai kỳ. Component này bảo đảm:
 *
 * 1. Số kỳ **luôn zero-pad 3 chữ số** (`#015`, không `#15`) — cùng độ rộng, quét mắt theo cột được.
 * 2. Kỳ **không thuộc hôm nay** luôn kèm badge ngày (`#015 · 06/09`) — mắt bắt ngay kỳ tồn.
 * 3. **Không tooltip** — badge ngày + cột giờ quay đã đủ; tooltip `drawId` thô che click/expand
 *    trên bảng mật độ cao (Ops Hub, 10/09).
 *
 * Dùng cho cả Keno và Bingo18 (đặt ở `components/games/shared/` theo `frontend-dev.mdc` §2.3).
 */

import { todayVN } from "@megawin/shared/utils";

import { cn } from "@/lib/utils";

/** Định dạng `drawId` `"YYYY-MM-DD.NNN"` → `{ date: "YYYY-MM-DD", no: "NNN" }`. */
export function parseDrawId(drawId: string): { date: string; no: string } | null {
  const dot = drawId.indexOf(".");
  if (dot === -1) {
    return null;
  }
  return { date: drawId.slice(0, dot), no: drawId.slice(dot + 1) };
}

export interface DrawIdLabelProps {
  /** Mã kỳ đầy đủ, format `YYYY-MM-DD.NNN` (xem `player-sdk-jsdoc.mdc` §DrawId Format). */
  drawId: string;
  /**
   * `"compact"` — `#015` (hôm nay) hoặc `#015 · 06/09` (ngày khác). Dùng trong bảng, rail.
   * `"full"` — `2026-09-07.015` nguyên văn. Dùng trong expand panel, dialog, breadcrumb.
   */
  mode?: "compact" | "full";
  className?: string;
}

/**
 * Hiển thị mã kỳ (compact: số + badge ngày nếu không phải hôm nay).
 *
 * Ở `mode="compact"`, badge ngày CHỈ hiện khi kỳ không thuộc hôm nay — mật độ cao nên không
 * lặp ngày hôm nay ở 200 dòng, nhưng kỳ tồn thì bắt buộc phải nhìn thấy.
 */
export function DrawIdLabel({ drawId, mode = "compact", className }: DrawIdLabelProps) {
  const parsed = parseDrawId(drawId);

  // `drawId` không đúng format (không nên xảy ra) → hiện thô, không crash UI vận hành.
  if (parsed === null) {
    return <span className={cn("tabular-nums", className)}>{drawId}</span>;
  }

  if (mode === "full") {
    return <span className={cn("font-medium tabular-nums", className)}>{drawId}</span>;
  }

  const isToday = parsed.date === todayVN();
  // `NNN` từ drawId đã zero-pad sẵn ở nguồn; pad thêm để phòng dữ liệu cũ ghi "15".
  const noLabel = `#${parsed.no.padStart(3, "0")}`;
  // "2026-09-06" → "06/09" (bỏ năm — kỳ tồn quá 1 năm không tồn tại trong vận hành).
  const dayLabel = `${parsed.date.slice(8, 10)}/${parsed.date.slice(5, 7)}`;

  return (
    <span className={cn("inline-flex items-center gap-1.5 tabular-nums", className)}>
      <span className="font-medium">{noLabel}</span>
      {isToday ? null : (
        <span className="rounded bg-amber-500/15 px-1 py-0.5 font-medium text-[10px] text-amber-700 leading-none dark:text-amber-400">
          {dayLabel}
        </span>
      )}
    </span>
  );
}
