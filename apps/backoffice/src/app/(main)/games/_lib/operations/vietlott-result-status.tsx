import { AlertTriangle, CheckCircle2, Loader2 } from "lucide-react";

import { Button } from "@/components/ui/button";

/**
 * Trạng thái lấy kết quả Vietlott tự động (ResultFeed) — hiển thị cạnh
 * `VietlottReminderNote` trong dialog công bố/sửa kết quả (`publish-result-action.tsx`).
 * Không tự quyết định fetch/apply — chỉ hiển thị theo state do caller truyền vào
 * (`useVietlottResult` hook + logic tự-điền-nếu-rỗng của từng form).
 *
 * `found === undefined` (chưa fetch, VD chưa có `drawPeriod`) → không render gì.
 *
 * @deprecated Thay bằng `VietlottResultPanel` (`vietlott-result-panel.tsx`) — 1 khung box
 * thống nhất, có so sánh inline trên lưới + icon tin cậy (P09 §6). Keno đã chuyển
 * (`09-result-autofill-ux-redesign.plan.md`). 6 game còn lại (`lotto535`, `mega645`,
 * `power655`, `max3d`, `max3dpro`, `bingo18`) vẫn dùng component này tạm thời — xoá file này
 * sau khi cả 7 game đã chuyển sang `VietlottResultPanel` (plan §11 bước 4).
 */
export function VietlottResultStatus({
  isLoading,
  found,
  onApply,
  alreadyApplied,
}: {
  isLoading: boolean;
  found: boolean | undefined;
  onApply: () => void;
  alreadyApplied: boolean;
}) {
  if (isLoading) {
    return (
      <div className="mt-3 flex items-center gap-1.5 text-xs text-muted-foreground">
        <Loader2 className="size-3 animate-spin" />
        <span>Đang lấy kết quả tự động…</span>
      </div>
    );
  }

  if (found === undefined) {
    return null;
  }

  if (!found) {
    return (
      <div className="mt-3 rounded-lg border border-amber-400/60 bg-amber-50 px-4 py-3 dark:bg-amber-900/30">
        <div className="flex items-start gap-2">
          <AlertTriangle className="size-3.5 text-amber-700 dark:text-amber-400 shrink-0 mt-0.5" />
          <p className="text-sm font-medium text-amber-800 dark:text-amber-300">
            Chưa có kết quả tự động cho kỳ này — vui lòng tự nhập.
          </p>
        </div>
      </div>
    );
  }

  if (alreadyApplied) {
    return (
      <div className="mt-3 flex items-center gap-1.5 text-xs text-emerald-700 dark:text-emerald-400">
        <CheckCircle2 className="size-3" />
        <span>Đã điền kết quả tự động từ ResultFeed.</span>
      </div>
    );
  }

  return (
    <div className="mt-3 rounded-lg border border-emerald-300/60 bg-emerald-50 px-4 py-3 dark:bg-emerald-900/20">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="size-3.5 text-emerald-600 dark:text-emerald-400 shrink-0 mt-0.5" />
        <div className="flex flex-1 items-center justify-between gap-3">
          <p className="text-sm text-emerald-800 dark:text-emerald-300">
            Đã lấy được kết quả tự động — đối chiếu kỹ trước khi lưu.
          </p>
          <Button type="button" size="sm" variant="outline" onClick={onApply} className="shrink-0">
            Dùng kết quả này
          </Button>
        </div>
      </div>
    </div>
  );
}
