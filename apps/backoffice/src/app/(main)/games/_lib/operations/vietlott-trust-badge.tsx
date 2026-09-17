import { Bot, ShieldCheck } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

/**
 * Icon nhỏ thể hiện độ tin cậy của kết quả lấy từ ResultFeed — chỉ hiện ở state `filled`/
 * `match` của `VietlottResultPanel`. Chỉ phân biệt 2 trường hợp: máy tự chốt hay người đã
 * xác nhận — KHÔNG hiện số nguồn đối chiếu (staff không cần chi tiết này, dễ gây rối mắt).
 *
 * Dùng CHUNG cho dialog công bố/sửa kết quả của cả 7 game.
 */
export function VietlottTrustBadge({ verifiedByHuman }: { verifiedByHuman: boolean }) {
  if (verifiedByHuman) {
    return (
      <Tooltip>
        <TooltipTrigger asChild>
          <ShieldCheck className="text-profit size-3.5 shrink-0" />
        </TooltipTrigger>
        <TooltipContent>Do người xác nhận</TooltipContent>
      </Tooltip>
    );
  }

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Bot className="text-info size-3.5 shrink-0" />
      </TooltipTrigger>
      <TooltipContent>Máy tự chốt</TooltipContent>
    </Tooltip>
  );
}
