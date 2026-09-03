import { Loader2, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

/**
 * Nút "Kết quả" — CTA chính để tự lấy kết quả tham khảo từ ResultFeed/Vietlott, đặt ở header
 * lưới nhập số (KHÔNG lẫn vào label ô "Mã kỳ Vietlott" như trước — đây là tính năng tiết kiệm
 * nhiều thời gian vận hành nhất, cần nổi bật thay vì trông như 1 link phụ trợ).
 *
 * Style `variant="ghost"` (không viền) — nhất quán với `RandomFillButton` ("Ngẫu nhiên") đứng
 * cạnh nó trong cùng 1 header row; chỉ phân biệt bằng màu chữ/icon (violet) thay vì viền riêng.
 * Icon `WandSparkles` gợi cảm giác "phép thuật" — nhất quán với icon dùng lại ở nút "Áp dụng"
 * trong `VietlottResultPanel` (cùng 1 hành động: lấy/dùng số từ nguồn tham chiếu).
 *
 * Dùng CHUNG cho dialog công bố/sửa kết quả của cả 7 game (đặt ở `_lib/operations` — không
 * riêng Keno).
 */
export function MagicFetchResultButton({
  onFetch,
  isFetching,
  disabled,
}: {
  onFetch: () => void;
  isFetching: boolean;
  /** Chưa có mã kỳ Vietlott để tra cứu — disable kèm tooltip giải thích riêng. */
  disabled: boolean;
}) {
  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          type="button"
          size="sm"
          variant="ghost"
          onClick={onFetch}
          disabled={disabled || isFetching}
          className={cn(
            "gap-1.5 text-violet-700 hover:bg-violet-50 hover:text-violet-800 dark:text-violet-400 dark:hover:bg-violet-950/40",
          )}
        >
          {isFetching ? <Loader2 className="size-3.5 animate-spin" /> : <WandSparkles className="size-3.5" />}
          Kết quả
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        {disabled ? "Cần nhập mã kỳ Vietlott trước" : "Lấy kết quả tham khảo từ Vietlott"}
      </TooltipContent>
    </Tooltip>
  );
}
