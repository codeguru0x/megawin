/**
 * Shared – Lifecycle Stepper cho Draw Command Center (mọi game)
 *
 * Trước khi tách, `getSteps()` giống 100% logic ở cả 7 game; `LifecycleStepper`
 * giống ~95% — chỉ khác accent màu ở Keno (`orange-500`) và Bingo18 (`amber-500`)
 * so với 5 game còn lại (`primary`). Theo yêu cầu: KHÔNG cần tách riêng theo
 * brand game — đồng bộ 1 accent `primary` duy nhất cho tất cả.
 *
 * Dùng interface tối thiểu `DrawLifecycleFields` để nhận draw của bất kỳ game
 * nào (structural typing).
 */

import { DrawStatus } from "@megawin/game-core/entities";
import { displayVNTime } from "@megawin/shared/utils";
import { CheckCircle2, Circle } from "lucide-react";

import { cn } from "@/lib/utils";

import type { DrawScheduleFields } from "./draw-schedule-chips";

export type StepState = "done" | "active" | "pending";

export interface Step {
  label: string;
  time?: string;
  state: StepState;
}

/** Field tối thiểu cần cho `getDrawLifecycleSteps` — mọi `DrawSelectorItem` game đều thoả. */
export interface DrawLifecycleFields extends DrawScheduleFields {
  /** Trạng thái kỳ quay hiện tại. */
  status: string;
  /** Thời điểm quay theo lịch (ISO 8601) — fallback hiển thị khi chưa publish. */
  scheduledDrawAt: string;
  /** Thời điểm settle gần nhất (ISO 8601). */
  settledAt?: string;
}

/**
 * Build 4 bước lifecycle (Mở bán → Đóng bán → Công bố KQ → Kết sổ) từ trạng
 * thái + mốc thời gian hiện tại của draw. Bước "Công bố KQ" hiển thị giờ
 * publish thực tế (`drawResultAt`) nếu đã có, else fallback giờ quay theo
 * lịch (`scheduledDrawAt`) — chỉ để hiển thị, KHÔNG ảnh hưởng logic resettle.
 */
export function getDrawLifecycleSteps(draw: DrawLifecycleFields): Step[] {
  const s = draw.status;
  const order = [
    DrawStatus.Scheduled,
    DrawStatus.SalesOpen,
    DrawStatus.SalesClosed,
    DrawStatus.Published,
    DrawStatus.Settling,
    DrawStatus.Settled,
  ];
  type OrderedStatus = (typeof order)[number];
  const done = (statuses: string[]) =>
    statuses.some((st) => order.indexOf(s as OrderedStatus) > order.indexOf(st as OrderedStatus));
  const active = (target: string) => s === target;

  return [
    {
      label: "Mở bán",
      // salesOpenAt chỉ có sau khi kỳ đã mở bán — kỳ Scheduled sẽ không hiện giờ
      time: draw.salesOpenAt ? displayVNTime(draw.salesOpenAt) : undefined,
      state: active(DrawStatus.SalesOpen) ? "active" : done([DrawStatus.SalesOpen]) ? "done" : "pending",
    },
    {
      label: "Đóng bán",
      time: displayVNTime(draw.salesCloseAt),
      state: active(DrawStatus.SalesClosed) ? "active" : done([DrawStatus.SalesClosed]) ? "done" : "pending",
    },
    {
      label: "Công bố KQ",
      // drawResultAt = thời điểm publish thực tế; fallback giờ quay theo lịch khi chưa publish
      time: draw.drawResultAt ? displayVNTime(draw.drawResultAt) : displayVNTime(draw.scheduledDrawAt),
      state: active(DrawStatus.Published) ? "active" : done([DrawStatus.Published]) ? "done" : "pending",
    },
    {
      label: "Kết sổ",
      // Ưu tiên settledAt từ selector (luôn có sau settle) — result chỉ có khi đã load detail
      time: draw.settledAt ? displayVNTime(draw.settledAt) : undefined,
      state: active(DrawStatus.Settling) ? "active" : s === DrawStatus.Settled ? "done" : "pending",
    },
  ];
}

/**
 * Stepper ngang hiển thị 4 bước lifecycle với connector tự stretch lấp đầy
 * khoảng giữa (flex-1). Accent màu đồng bộ `primary` cho mọi game (không
 * tách riêng theo brand).
 */
export function LifecycleStepper({ steps }: { steps: Step[] }) {
  return (
    <div className="flex items-start w-full">
      {steps.map((step, i) => (
        <div key={i} className="flex items-start flex-1 min-w-0">
          <div className="flex flex-col items-center gap-1 shrink-0">
            <div
              className={cn(
                "flex size-6 items-center justify-center rounded-full border-2 transition-all",
                step.state === "done" && "border-emerald-500 bg-emerald-50 dark:bg-emerald-950/40",
                step.state === "active" && "border-primary bg-primary/10",
                step.state === "pending" && "border-border bg-background",
              )}
            >
              {step.state === "done" ? (
                <CheckCircle2 className="size-3 text-emerald-500" />
              ) : step.state === "active" ? (
                <span className="size-1.5 rounded-full bg-primary animate-pulse" />
              ) : (
                <Circle className="size-3 text-muted-foreground/30" />
              )}
            </div>
            <div className="text-center w-16">
              <p
                className={cn(
                  "text-xs font-medium leading-tight",
                  step.state === "active" && "text-foreground font-semibold",
                  step.state === "done" && "text-muted-foreground",
                  step.state === "pending" && "text-muted-foreground/40",
                )}
              >
                {step.label}
              </p>
              {step.time && (
                <p className="text-[10px] font-mono tabular-nums text-muted-foreground/60 mt-0.5">{step.time}</p>
              )}
            </div>
          </div>
          {i < steps.length - 1 && (
            <div className="flex-1 mt-3 mx-1 min-w-4">
              <div
                className={cn(
                  "h-0.5 w-full rounded-full",
                  steps[i + 1]?.state !== "pending" ? "bg-emerald-400" : "bg-border/60",
                )}
              />
            </div>
          )}
        </div>
      ))}
    </div>
  );
}
