"use client";

/**
 * Keno — Toggle "Mira Auto-Pilot": chuyển kỳ quay sang chế độ để Mira (AI) tự giám sát và xử lý
 * thay staff (mở bán, đóng bán, công bố kết quả, xử lý cảnh báo bất thường…).
 *
 * Style nổi bật có chủ đích: đây là quyền hạn lớn (giao AI tự xử lý đường tiền), pill cần bắt mắt
 * hơn các badge trạng thái xung quanh (Live, alert…) để staff nhận ra ngay đang ở chế độ nào — gradient
 * tím khi BẬT, viền trung tính khi TẮT. Trạng thái chỉ còn đọc qua vị trí Switch, KHÔNG có dòng phụ
 * "Đang bật/tắt" để giữ đúng 1 hàng.
 *
 * ⚠️ CHỈ LÀ UI (2026-08-30): chưa nối chức năng thật — bấm ON/OFF chỉ đổi state cục bộ trong
 * component, KHÔNG gọi API, KHÔNG bật/tắt bất kỳ cron/worker nào. Khi nối chức năng thật: đọc
 * trạng thái từ server (vd `GetOpsConfigUseCase`), gọi mutation lúc `onCheckedChange`, và cân nhắc
 * thêm dialog xác nhận trước khi BẬT (giao quyền tự động cho AI trên đường tiền cần staff xác nhận
 * rõ ràng, không phải 1 click).
 */

import { useState } from "react";

import { Sparkles } from "lucide-react";

import { Switch } from "@/components/ui/switch";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

export function AutoPilotToggle() {
  const [enabled, setEnabled] = useState(false);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <div
          className={cn(
            "flex items-center gap-2 rounded-full py-1 pl-1 pr-2 transition-all",
            enabled
              ? "bg-linear-to-r from-violet-600 to-fuchsia-600 shadow-md shadow-violet-500/30 ring-1 ring-violet-400/50"
              : "bg-muted/50 ring-1 ring-border",
          )}
        >
          <span
            className={cn(
              "flex size-6 items-center justify-center rounded-full transition-colors",
              enabled ? "bg-white/20" : "bg-muted-foreground/15",
            )}
          >
            <Sparkles className={cn("size-3.5", enabled ? "text-white" : "text-muted-foreground")} />
          </span>
          <span className={cn("text-xs font-semibold whitespace-nowrap", enabled ? "text-white" : "text-foreground")}>
            Mira Auto-Pilot
          </span>
          <Switch
            checked={enabled}
            onCheckedChange={setEnabled}
            size="sm"
            aria-label="Bật/tắt Mira Auto-Pilot"
            className={cn(enabled && "data-[state=checked]:bg-white/30")}
          />
        </div>
      </TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-64 text-center">
        Để Mira (AI) tự giám sát và xử lý kỳ quay: mở bán, đóng bán, công bố kết quả, cảnh báo bất thường — không cần
        thao tác tay.
      </TooltipContent>
    </Tooltip>
  );
}
