"use client";

/**
 * Ops Hub — Zone 1: PageHeader (p1-05 §B1 — viết lại theo tiền lệ trang `operations`)
 *
 * KHÔNG có `DrawSelector` — hub xem TẤT CẢ kỳ cùng lúc, không chọn 1 kỳ (plan p1-01 §7.1).
 * Đây là khác biệt cố ý so với trang `operations` (1 kỳ, sâu) — đừng "thêm cho đủ".
 *
 * KHÔNG hiện "Ngày tài chính": 1 ngày Bingo18 cắt qua 2 ngày tài chính (mốc 11:00) — hiện 1 giá
 * trị duy nhất gây hiểu sai kỳ nào thuộc ngày nào. Subtitle đổi thành ĐẾM VIỆC (số kỳ đang
 * theo dõi + số kỳ cần xử lý) — không hứa hẹn "hôm nay" vì `rows` có thể còn sót vài kỳ chưa
 * hoàn tất từ trước đó (`listUnfinishedDrawRows`, không lọc theo ngày).
 */

import { useEffect, useRef, useState } from "react";

import { GameProduct } from "@megawin/game-core/entities";
import { displayVNTimeWithSeconds } from "@megawin/shared/utils";
import { Layers, Plus } from "lucide-react";

import { CreateDrawAction } from "@/app/(main)/games/bingo18/operations/_lib/sections/draw-management/draw-actions";
import { Button } from "@/components/ui/button";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { GAME_COLORS } from "@/lib/game-colors";

import { HubGateTab } from "./sections/queue/queue-types";
import { useHubContext } from "./use-hub-context";

/**
 * Chỉ báo "Live" — đọc DOM ref, KHÔNG setState (tiền lệ `LastUpdatedBadge`,
 * `bingo18/operations/page.tsx:46-61`). `> 3 × pollSeconds` không tươi → chuyển "Chậm" (màu amber,
 * guideline §7.1) để staff luôn biết đang xem dữ liệu tươi hay đã đứng.
 *
 * Thay hẳn `RotateCw` + chữ đếm "Ns trước" (ồn, chiếm chỗ) bằng chấm nhấp nháy + chữ "Live" —
 * ĐÚNG pattern đã có sẵn trong repo (`operations/_lib/sections/analytics/live-feed.tsx:204-207`,
 * KHÔNG phát minh mới). Số giây/thời điểm cập nhật cuối chuyển vào tooltip (hiện khi hover) —
 * không mất thông tin, chỉ chuyển từ "luôn hiện" (ồn) sang "hiện khi cần" (gọn, p1-07 §8.1).
 *
 * Tooltip dùng `Tooltip`/`TooltipContent` (shadcn) thay `title` thô: staff phản hồi không biết
 * bấm "Live" để làm gì — tooltip nói rõ "Bấm để tải dữ liệu mới nhất" kèm thời điểm cập nhật
 * lần cuối, thay vì chỉ có nhãn "Làm mới" mơ hồ.
 *
 * Gộp icon + chữ + click-to-refresh thành 1 nút ghost DUY NHẤT (plan §B1 điểm 3, giữ nguyên) —
 * bấm bất kỳ đâu trên nút đều refresh (giữ nguyên phím tắt `r` gọi `actions.refresh` ở nơi khác).
 *
 * p1-08 §1.5/§9 Q5: nút này chuyển từ cụm hành động bên PHẢI (cạnh "Tạo kỳ quay") xuống ngay
 * cạnh dòng subtitle bên TRÁI ("N kỳ đang theo dõi") — trước đó tách xa nhau, không có liên
 * quan trực quan dù cùng nói về "trạng thái dữ liệu hiện tại".
 */
function RefreshButton() {
  const { state, actions } = useHubContext();
  const dotRef = useRef<HTMLSpanElement>(null);
  const labelRef = useRef<HTMLSpanElement>(null);
  const pollSecondsRef = useRef(10);
  pollSecondsRef.current = state.snapshot?.pollSeconds ?? pollSecondsRef.current;

  // Mốc cập nhật gần nhất đổi mỗi khi query fetch xong — ghi lại ĐÚNG lúc đó, không suy ra từ Date.now().
  const lastFetchAtMsRef = useRef(Date.now());
  useEffect(() => {
    void state.snapshot;
    lastFetchAtMsRef.current = Date.now();
  }, [state.snapshot]);

  useEffect(() => {
    function tick() {
      const elapsedSec = Math.max(0, Math.round((Date.now() - lastFetchAtMsRef.current) / 1000));
      const stale = elapsedSec > 3 * pollSecondsRef.current;
      const dot = dotRef.current;
      const label = labelRef.current;
      // biome-ignore lint/suspicious/noUnnecessaryConditions: Biome suy luận nhầm `current` luôn non-null vì đọc qua closure lồng trong `tick()` — `tsc --noEmit` xác nhận type thật là `HTMLSpanElement | null`.
      if (dot) {
        dot.className = `size-1.5 rounded-full animate-pulse ${stale ? "bg-amber-500" : "bg-emerald-500"}`;
      }
      // biome-ignore lint/suspicious/noUnnecessaryConditions: Tương tự — Biome không theo dõi đúng qua closure lồng, `tsc` xác nhận `label` có thể `null`.
      if (label) {
        label.textContent = stale ? "Chậm" : "Live";
        label.className = `font-medium text-xs ${stale ? "text-amber-600" : "text-emerald-600"}`;
      }
    }
    tick();
    const id = setInterval(tick, 1000);
    return () => clearInterval(id);
  }, []);

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Button
          variant="ghost"
          size="sm"
          className="h-auto gap-1.5 px-1.5 py-0.5"
          disabled={state.isFetching}
          onClick={actions.refresh}
        >
          <span ref={dotRef} className="size-1.5 animate-pulse rounded-full bg-emerald-500" />
          <span ref={labelRef} className="font-medium text-emerald-600 text-xs">
            Live
          </span>
        </Button>
      </TooltipTrigger>
      <TooltipContent>
        Bấm để tải dữ liệu mới nhất (phím tắt r) — cập nhật lần cuối:{" "}
        {displayVNTimeWithSeconds(new Date(lastFetchAtMsRef.current))}
      </TooltipContent>
    </Tooltip>
  );
}

export function HubPageHeader() {
  const { state } = useHubContext();
  const [createOpen, setCreateOpen] = useState(false);
  const iconGradient = GAME_COLORS[GameProduct.Bingo18].iconGradient;

  const totalRows = state.rows.length;
  // "N kỳ cần xử lý" = tổng 4 tab non-`All` (p1-08 §9 Q6 — VẪN TÍNH CẢ "Chưa có KQ" vào tổng,
  // giữ cảm giác cấp bách, không giảm số dù tab "Cần xử lý" gộp chung đã bị xoá — mỗi dòng chỉ
  // thuộc ĐÚNG 1 trong 4 tab này nên tổng không bị đếm trùng, trừ 1 số cạnh hiếm gate=Halted
  // vừa khớp `PendingOpen` vừa khớp stage khác — chấp nhận sai số nhỏ, không đáng kể).
  const needsActionCount =
    state.tabCounts[HubGateTab.PendingOpen] +
    state.tabCounts[HubGateTab.Ended] +
    state.tabCounts[HubGateTab.AwaitingResult] +
    state.tabCounts[HubGateTab.AwaitingSettle];

  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className={`flex size-9 items-center justify-center rounded-xl bg-linear-to-br shadow-sm ${iconGradient}`}>
          <Layers className="size-4.5 text-white" />
        </div>
        <div>
          <h1 className="font-semibold text-foreground text-lg tracking-tight">Bingo18 — Trung tâm vận hành</h1>
          {/* "Live" chuyển từ cụm nút bên phải xuống ngay cạnh subtitle (p1-08 §1.5/§9 Q5) —
              trước đó tách xa dòng "N kỳ đang theo dõi", không liên quan trực quan. */}
          <div className="flex items-center gap-2">
            <p className="text-muted-foreground text-xs">
              {totalRows} kỳ đang theo dõi
              {needsActionCount > 0 ? (
                <span className="font-medium text-rose-600 dark:text-rose-400"> · {needsActionCount} kỳ cần xử lý</span>
              ) : null}
              <RefreshButton />
            </p>
          </div>
        </div>
      </div>
      <div className="flex items-center gap-3">
        <Button size="sm" className="gap-2" onClick={() => setCreateOpen(true)}>
          <Plus className="size-4" />
          Tạo kỳ quay
        </Button>
      </div>

      <CreateDrawAction open={createOpen} onOpenChange={setCreateOpen} />
    </div>
  );
}

/** Skeleton khớp chiều cao PageHeader thật — tránh layout shift (guideline §1.5 vercel-react-best-practices). */
export function HubPageHeaderSkeleton() {
  return (
    <div className="flex flex-wrap items-center justify-between gap-4">
      <div className="flex items-center gap-3">
        <div className="size-9 animate-pulse rounded-xl bg-muted" />
        <div className="flex flex-col gap-1.5">
          <div className="h-5 w-56 animate-pulse rounded bg-muted" />
          <div className="h-3.5 w-40 animate-pulse rounded bg-muted" />
        </div>
      </div>
      <div className="flex items-center gap-3">
        <div className="h-8 w-24 animate-pulse rounded-md bg-muted" />
      </div>
    </div>
  );
}
