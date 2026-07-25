/**
 * Shared – Schedule Chips cho Draw Command Center (mọi game)
 *
 * Dải chip hiển thị 3 mốc lịch (mở bán/đóng bán/quay số) kèm trạng thái
 * "đã qua"/"sắp tới" — logic và JSX giống byte-for-byte ở cả 7 game trước khi
 * tách, chỉ khác nhau tên field/type container (`DrawSelectorItem` từng game).
 * Dùng interface tối thiểu `DrawScheduleFields` để nhận draw của bất kỳ game
 * nào (structural typing — không cần game nào extends interface này).
 */

import { displayVNDateTime, displayVNTime } from "@megawin/shared/utils";
import { Clock, Lock, Unlock } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/** Field tối thiểu cần cho `ScheduleChips` — mọi `DrawSelectorItem` game đều thoả. */
export interface DrawScheduleFields {
  /** Thời điểm mở bán (ISO 8601) — undefined nếu chưa mở. */
  salesOpenAt?: string;
  /** Thời điểm đóng bán (ISO 8601). */
  salesCloseAt: string;
  /** Thời điểm công bố kết quả thực tế (ISO 8601) — undefined nếu chưa publish. */
  drawResultAt?: string;
}

/**
 * Dải chip hiển thị mốc Mở bán / Đóng bán / Quay số kèm giờ + tooltip full
 * datetime. Chip "sáng" (active) khi mốc đó CHƯA qua; "mờ" khi đã qua.
 */
export function ScheduleChips({ draw }: { draw: DrawScheduleFields }) {
  const now = new Date();
  const items: {
    icon: React.ReactNode;
    label: string;
    time: string;
    fullDateTime: string;
    active: boolean;
    color: string;
  }[] = [];

  if (draw.salesOpenAt) {
    const past = new Date(draw.salesOpenAt) < now;
    items.push({
      icon: <Unlock className={cn("size-3.5 shrink-0", past ? "text-emerald-400" : "text-emerald-500")} />,
      label: "Mở bán",
      time: displayVNTime(draw.salesOpenAt),
      fullDateTime: displayVNDateTime(draw.salesOpenAt),
      active: !past,
      color: "text-emerald-600 dark:text-emerald-400",
    });
  }

  const closePast = new Date(draw.salesCloseAt) < now;
  items.push({
    icon: <Lock className={cn("size-3.5 shrink-0", closePast ? "text-amber-400" : "text-amber-500")} />,
    label: "Đóng bán",
    time: displayVNTime(draw.salesCloseAt),
    fullDateTime: displayVNDateTime(draw.salesCloseAt),
    active: !closePast,
    color: "text-amber-600 dark:text-amber-400",
  });

  if (draw.drawResultAt) {
    const past = new Date(draw.drawResultAt) < now;
    items.push({
      icon: <Clock className={cn("size-3.5 shrink-0", past ? "text-violet-400" : "text-violet-500")} />,
      label: "Quay số",
      time: displayVNTime(draw.drawResultAt),
      fullDateTime: displayVNDateTime(draw.drawResultAt),
      active: !past,
      color: "text-violet-600 dark:text-violet-400",
    });
  }

  return (
    <div className="flex items-center gap-3">
      {items.map((item) => (
        <Tooltip key={item.label}>
          <TooltipTrigger asChild>
            <div className="flex items-center gap-1.5 cursor-default select-none">
              {item.icon}
              <span className={cn("text-xs", item.active ? "text-foreground" : "text-muted-foreground")}>
                {item.label}
              </span>
              <span
                className={cn(
                  "text-xs font-mono tabular-nums font-bold",
                  item.active ? item.color : "text-muted-foreground",
                )}
              >
                {item.time}
              </span>
            </div>
          </TooltipTrigger>
          <TooltipContent side="bottom" className="font-mono text-xs">
            {item.fullDateTime}
          </TooltipContent>
        </Tooltip>
      ))}
    </div>
  );
}
