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
      <div className="text-muted-foreground mt-3 flex items-center gap-1.5 text-xs">
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
      <div className="border-warning/60 bg-warning mt-3 rounded-lg border px-4 py-3">
        <div className="flex items-start gap-2">
          <AlertTriangle className="text-warning mt-0.5 size-3.5 shrink-0" />
          <p className="text-warning text-sm font-medium">Chưa có kết quả tự động cho kỳ này — vui lòng tự nhập.</p>
        </div>
      </div>
    );
  }

  if (alreadyApplied) {
    return (
      <div className="text-profit mt-3 flex items-center gap-1.5 text-xs">
        <CheckCircle2 className="size-3" />
        <span>Đã điền kết quả tự động từ ResultFeed.</span>
      </div>
    );
  }

  return (
    <div className="border-profit/60 bg-profit mt-3 rounded-lg border px-4 py-3">
      <div className="flex items-start gap-2">
        <CheckCircle2 className="text-profit mt-0.5 size-3.5 shrink-0" />
        <div className="flex flex-1 items-center justify-between gap-3">
          <p className="text-profit text-sm">Đã lấy được kết quả tự động — đối chiếu kỹ trước khi lưu.</p>
          <Button type="button" size="sm" variant="outline" onClick={onApply} className="shrink-0">
            Dùng kết quả này
          </Button>
        </div>
      </div>
    </div>
  );
}
