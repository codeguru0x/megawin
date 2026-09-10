"use client";

/**
 * Ops Hub — Zone 5A (Bảng vận hành — plan §4, §5, §6)
 *
 * Render `state.rows5A` (đã filter+sort ở context, KHÔNG filter lại ở đây — plan §6.1).
 * Tab bar 5 tab (`HubGateTab`) + header sort click-to-toggle, cả hai ghi vào URL qua
 * `useHubUrlParams` — context tự đọc lại URL và tính `rows5A` mới (round-trip URL → context →
 * render, KHÔNG state cục bộ riêng cho tab/sort — 1 nguồn chân lý duy nhất, plan §4.1/§4.2).
 *
 * Checkbox header ("chọn tất cả đang hiện") chỉ chọn trong PHẠM VI `canSelectRows` (dòng có
 * ≥1 action khả dụng) — chọn dòng không action nào được là vô nghĩa (plan §5.3).
 */

import { Fragment, useCallback, useEffect, useMemo, useRef, useState } from "react";

import { DrawStatus } from "@megawin/game-core/entities";
import { type AlertTriangle, ArrowDown, ArrowUp, Calculator, List, Lock, Radio, Unlock } from "lucide-react";
import { toast } from "sonner";

import { PublishResultAction } from "@/app/(main)/games/bingo18/operations/_lib/sections/draw-management/draw-actions";
import { Checkbox } from "@/components/ui/checkbox";
import { Table, TableBody, TableHead, TableHeader, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { stageStartMs } from "../../derive-draw-state";
import type { DerivedRow } from "../../hub-types";
import { useHubContext } from "../../use-hub-context";
import { useHubUrlParams } from "../../use-hub-url-params";
import { HubExpandPanel } from "./hub-expand-panel";
import { getRowAccent, hasAnyAction } from "./partition-by-action";
import { QueueRow } from "./queue-row";
import { HUB_GATE_TAB_LABELS, HUB_GATE_TAB_ORDER, HubGateTab, QueueSortDir, QueueSortKey } from "./queue-types";
import { toPublishResultDraw } from "./to-publish-result-draw";

/** Icon từng tab (bạn yêu cầu — plan §B5) — cùng icon dùng ở KPI strip (Zone 2) cho 4 tab
 * trùng khái niệm, tab "Tất cả" dùng `List` vì không có KPI tương ứng. `PendingOpen` (mới,
 * p1-08 §7) dùng `Unlock` — action tương ứng là "Mở bán", đối xứng với `Lock` của "Chờ đóng bán". */
const TAB_ICON: Record<HubGateTab, typeof AlertTriangle> = {
  [HubGateTab.PendingOpen]: Unlock,
  [HubGateTab.Ended]: Lock,
  [HubGateTab.AwaitingResult]: Radio,
  [HubGateTab.AwaitingSettle]: Calculator,
  [HubGateTab.All]: List,
};

interface SortHeaderProps {
  label: string;
  sortKey: QueueSortKey;
  activeSortKey: QueueSortKey;
  activeSortDir: QueueSortDir;
  align?: "left" | "right";
  onSort: (key: QueueSortKey) => void;
}

function SortHeader({ label, sortKey, activeSortKey, activeSortDir, align = "left", onSort }: SortHeaderProps) {
  const isActive = activeSortKey === sortKey;
  return (
    <TableHead className={align === "right" ? "text-right" : undefined}>
      <button
        type="button"
        onClick={() => onSort(sortKey)}
        className={cn(
          "inline-flex items-center gap-1 hover:text-foreground",
          isActive ? "text-foreground" : "text-muted-foreground",
        )}
      >
        {label}
        {isActive ? (
          activeSortDir === QueueSortDir.Desc ? (
            <ArrowDown className="size-3" />
          ) : (
            <ArrowUp className="size-3" />
          )
        ) : null}
      </button>
    </TableHead>
  );
}

/**
 * Đọc `ageAnchorMs`/`remainingSec` từ `DerivedRow` cho `QueueRow` — logic anchor theo `gate`/`stage`
 * (guideline §1.4).
 *
 * `ageAnchorMs` lấy từ `stageStartMs` (timestamp TUYỆT ĐỐI), **KHÔNG** phải
 * `Date.now() - row.ageInStageSec * 1000` như bản trước: công thức đó trộn đồng hồ sống với snapshot
 * nên counter ĐỨNG YÊN (đo được `3h17ph` suốt 90 giây trong khi mốc thật đã tới `3h23ph`) — xem
 * JSDoc `stageStartMs` để biết chi tiết cơ chế.
 */
function getAgeAnchor(row: DerivedRow): { ageAnchorMs: number | null; remainingSec: number | null } {
  if (row.gate === "pending_open" || row.gate === "halted") {
    return { ageAnchorMs: null, remainingSec: row.remainingSec };
  }
  return { ageAnchorMs: stageStartMs(row.ts, row.stage), remainingSec: null };
}

export function HubQueueTable() {
  const { state, actions, meta } = useHubContext();
  const [, setUrlParams] = useHubUrlParams();
  const { rows5A, tabCounts, activeTab, sortKey, sortDir, validSelection, rowErrors } = state;

  const nowMs = meta.getNowMs();

  // Shift+Click chọn cả DẢI (round 4, kiểu chọn file macOS Finder) — thay vì bắt click từng ô
  // một khi cần chọn nhiều chục kỳ (`BULK_MAX_DRAWS` cho phép tới 50/lần bulk). `shiftKeyRef`
  // đọc từ `mousedown` (XẢY RA TRƯỚC `click`/`onCheckedChange` — Radix Checkbox không cấp
  // event gốc trong callback đó).
  //
  // `lastClickedIndexRef` là NEO — CHỈ dời khi click THƯỜNG (không Shift), giữ NGUYÊN qua mọi
  // lần Shift+Click liên tiếp (round 4 v2, đúng hành vi Finder: click ô 1 → neo=1; Shift+click
  // ô 7 → chọn 1-7, neo VẪN=1; Shift+click ô 4 tiếp theo → co dải về 1-4, không "nhảy" neo sang
  // 7). Bug round 4: neo dời theo MỌI click kể cả Shift → Shift+click 2 lần liên tiếp vào ĐÚNG
  // 1 ô đích sẽ có `anchor === rowIndex` (dải chỉ còn 1 ô) → không unselect được cả dải như
  // Finder thật, đúng lỗi user báo ("chỉ cộng 1 chiều, click lại không unselect").
  //
  // Chiều CỘNG/BỎ của Shift+Click dựa vào `wasSelected` (trạng thái Ô ĐÍCH TRƯỚC click, đọc từ
  // `isSelected` closure của chính checkbox đó) — đích CHƯA chọn → cộng cả dải vào selection
  // hiện có; đích ĐÃ chọn → bỏ cả dải khỏi selection hiện có.
  const shiftKeyRef = useRef(false);
  const lastClickedIndexRef = useRef<number | null>(null);

  const handleCheckboxMouseDown = useCallback((shiftKey: boolean) => {
    shiftKeyRef.current = shiftKey;
  }, []);

  // Fix bug perf (09/09) — deps CŨ có `nowMs` (giá trị NGUYÊN THUỶ đọc `Date.now()` mỗi lần
  // render component, KHÔNG PHẢI state/ref) → callback này bị tạo MỚI ở MỌI LẦN RENDER của
  // `HubQueueTable`, phá `memo` của HẾT `QueueRow` (props `onToggleSelect` đổi reference dù
  // giá trị logic không đổi). Với tab có hàng trăm kỳ (VD "Chờ đóng bán" sau khi chọn hết rồi
  // đổi tab — không còn trần 50 từ p1-09 §12), MỌI RENDER của bảng cha (poll 10s, gõ phím, đổi
  // sort…) giờ kéo theo re-render ĐẦY ĐỦ của hàng trăm `QueueRow` (kèm Radix Checkbox/Tooltip,
  // không rẻ) — đúng dạng "delay rất lâu" user báo. Sửa: gọi `meta.getNowMs()` NGAY TRONG
  // callback (giá trị tại thời điểm CLICK, không phải tại thời điểm RENDER) — bỏ hẳn `nowMs`
  // khỏi deps, dùng `meta` (ổn định qua context, chỉ đổi khi context thật sự đổi — §5.9).
  const handleToggleSelect = useCallback(
    (drawId: string, rowIndex: number, wasSelected: boolean) => {
      const anchor = lastClickedIndexRef.current;
      if (shiftKeyRef.current && anchor !== null) {
        const lo = Math.min(anchor, rowIndex);
        const hi = Math.max(anchor, rowIndex);
        const next = new Set(validSelection);
        const clickNowMs = meta.getNowMs();
        // Finder thật: Shift+Click vào Ô ĐÍCH đã được chọn → BỎ chọn cả dải (round 4 v2, fix
        // "chỉ cộng 1 chiều, click lại không unselect" user báo). Ô đích CHƯA chọn → chọn cả
        // dải như cũ. `wasSelected` là trạng thái checkbox đích TRƯỚC click này.
        for (let i = lo; i <= hi; i++) {
          const r = rows5A[i];
          if (!r || !hasAnyAction(r, clickNowMs)) {
            continue;
          }
          if (wasSelected) {
            next.delete(r.drawId);
          } else {
            next.add(r.drawId);
          }
        }
        actions.setSelection(next);
        // KHÔNG cập nhật `lastClickedIndexRef` ở nhánh Shift — neo phải GIỮ NGUYÊN tại lần
        // click THƯỜNG gần nhất (đúng hành vi Finder: Shift+click liên tiếp co/giãn dải quanh
        // 1 điểm neo cố định, không "nhảy" neo theo ô Shift-click vừa rồi). Bug round 4 v2:
        // trước đây neo di chuyển sau MỌI click (kể cả Shift) → Shift+click lần 2 vào ĐÚNG ô
        // đích cũ có `anchor === rowIndex` → dải co về đúng 1 ô, không unselect được cả dải.
      } else {
        actions.toggleSelect(drawId);
        lastClickedIndexRef.current = rowIndex;
      }
    },
    [validSelection, rows5A, actions, meta],
  );

  // Dòng đang mở inline expand — CHỈ 1 dòng, KHÔNG vào URL, KHÔNG persist (plan p1-03 §3.2).
  const [expandedDrawId, setExpandedDrawId] = useState<string | null>(null);

  // Kỳ đang expand mà rời `rows5A` → đóng panel. PHẢI phân biệt 2 lý do khác nhau (bug thật đã
  // sửa, review 08/09: đổi tab khi đang mở panel hiện toast sai "đã rời khỏi danh sách"):
  // 1. Rời khỏi `state.rows` (toàn bộ, không lọc tab) — kỳ ĐÃ settle/void thật, rời khỏi Hub
  //    hoàn toàn → đóng panel + toast (đúng, dữ liệu đã chết, không thể hiện tiếp).
  // 2. Vẫn còn trong `state.rows` nhưng rời `rows5A` (lọc theo `activeTab`) — do STAFF tự đổi
  //    tab/sort trong khi đang xem panel, kỳ không hề biến mất, chỉ đổi view → đóng panel LẶNG
  //    LẼ (không toast, không phải lỗi/bất ngờ gì để báo).
  useEffect(() => {
    if (expandedDrawId === null) {
      return;
    }
    const stillInRows5A = rows5A.some((r) => r.drawId === expandedDrawId);
    if (stillInRows5A) {
      return;
    }
    const stillTracked = state.rows.some((r) => r.drawId === expandedDrawId);
    if (!stillTracked) {
      const drawNo = state.rows.find((r) => r.drawId === expandedDrawId)?.drawNo;
      toast.info(drawNo !== undefined ? `Kỳ #${drawNo} đã rời khỏi danh sách.` : "Kỳ đang xem đã rời khỏi danh sách.");
    }
    setExpandedDrawId(null);
  }, [rows5A, state.rows, expandedDrawId]);

  // Fix bug perf (09/09) — cùng nguyên nhân với `handleToggleSelect` phía trên: function
  // thường (không `useCallback`) tạo THAM CHIẾU MỚI mỗi lần `HubQueueTable` render, phá `memo`
  // của `QueueRow` qua prop `onToggleExpand`. `setExpandedDrawId` là setState (ổn định, không
  // cần vào deps — §5.9 functional update), nên deps rỗng.
  const handleToggleExpand = useCallback((drawId: string) => {
    setExpandedDrawId((curr) => (curr === drawId ? null : drawId));
  }, []);

  // `Esc` đóng panel đang mở (plan p1-03 §3.2 điểm 2) — listener riêng, KHÔNG gộp vào
  // `use-hub-keyboard.ts` (hook đó là global cấp trang, còn Esc-đóng-panel chỉ có nghĩa khi
  // panel đang mở — gắn/gỡ theo `expandedDrawId` tránh check thừa trong listener toàn trang).
  useEffect(() => {
    if (expandedDrawId === null) {
      return undefined;
    }
    function handleEscape(e: KeyboardEvent) {
      if (e.key === "Escape") {
        setExpandedDrawId(null);
      }
    }
    window.addEventListener("keydown", handleEscape);
    return () => window.removeEventListener("keydown", handleEscape);
  }, [expandedDrawId]);

  // ── Dialog nhập kết quả tuần tự (p1-10) ─────────────────────────────────────────────────
  // Mount Ở ĐÂY (cấp bảng, KHÔNG phải trong `HubExpandPanel`) — bug thật đã sửa (09/09, xem
  // JSDoc `onOpenPublish` ở `hub-expand-panel.tsx`): mount trong panel khiến dialog bị UNMOUNT
  // theo panel mỗi khi kỳ đang thao tác đổi trạng thái (chính là lúc submit thành công), làm
  // "Xác nhận & Kỳ tiếp" trông như tự tắt dialog. `HubQueueTable` không bị effect tự-đóng-panel
  // ảnh hưởng (effect đó chỉ set `expandedDrawId`, không liên quan tới component này) nên dialog
  // sống sót qua mọi lần refetch/đổi tab giữa các lần submit trong hàng đợi.
  const [publishOpen, setPublishOpen] = useState(false);
  // Kỳ được bấm để MỞ dialog — đặt lên ĐẦU hàng đợi dù không phải kỳ sớm nhất theo `drawId`
  // (staff bấm nút ở kỳ nào, dialog phải bắt đầu đúng kỳ đó, không tự nhảy sang kỳ khác).
  const [publishAnchorId, setPublishAnchorId] = useState<string | null>(null);

  const handleOpenPublish = useCallback((drawId: string) => {
    setPublishAnchorId(drawId);
    setPublishOpen(true);
  }, []);

  // Hàng đợi "Chưa có KQ" — build từ `state.rows` (TOÀN BỘ kỳ, KHÔNG phải `rows5A` đã lọc theo
  // tab đang chọn — dùng nhầm sẽ bỏ sót kỳ ở tab khác, đúng bug đã gặp ở p1-06).
  //
  // BUG THẬT #1 đã sửa (09/09, báo bởi user): bản trước ghép `[anchor, ...pending nguyên vẹn trừ
  // anchor]` — TẤT CẢ kỳ `SalesClosed` khác, kể cả kỳ CŨ HƠN kỳ vừa bấm theo `drawId`. Bấm mở
  // dialog ở #006 (không phải kỳ tồn đọng sớm nhất) → "Kỳ tiếp" lại nhảy về #002 (cũ hơn) thay
  // vì #007 (kỳ liền kề THEO THỜI GIAN). Sửa lần 1: hàng đợi CHỈ gồm anchor + các kỳ ĐỨNG SAU
  // anchor theo `drawId` (`> anchor`).
  //
  // BUG THẬT #2 đã sửa (09/09, báo bởi user — vẫn còn sau fix #1): sửa #1 tìm `anchor` TRONG
  // `pending` (đã lọc `SalesClosed`). Sau khi staff bấm "Xác nhận & Kỳ tiếp" cho #005, mutation
  // thành công → Hub refetch → CHÍNH #005 đổi status khỏi `SalesClosed` → `pending.find(anchor)`
  // KHÔNG còn thấy #005 nữa (dù `publishAnchorId` vẫn là "005", chưa đổi trong suốt phiên hàng
  // đợi) → rơi vào nhánh fallback `return pending.map(...)` — TOÀN BỘ pending không lọc theo
  // anchor, kéo backlog cũ (#002...) trở lại → dialog nhảy về #002 đúng như user báo. Sửa: tìm
  // mốc `drawId` của anchor trong `state.rows` (KHÔNG giới hạn `SalesClosed`) — anchor còn tồn
  // tại trong `rows` dù status đã đổi, chỉ mất khỏi `pending`. Nếu anchor CHÍNH NÓ đã hết
  // `SalesClosed` (đã xử lý xong giữa phiên) → hàng đợi bắt đầu thẳng từ "sau anchor", không tự
  // thêm lại anchor vào đầu.
  const publishQueue = useMemo(() => {
    const pending = state.rows
      .filter((r) => r.status === DrawStatus.SalesClosed)
      .toSorted((a, b) => a.drawId.localeCompare(b.drawId));
    if (!publishAnchorId) {
      return pending.length > 0 ? pending.map(toPublishResultDraw) : undefined;
    }
    // Tìm anchor trong TOÀN BỘ `state.rows` — không giới hạn `SalesClosed` (xem BUG #2 ở trên).
    const anchorRow = state.rows.find((r) => r.drawId === publishAnchorId);
    if (!anchorRow) {
      return pending.length > 0 ? pending.map(toPublishResultDraw) : undefined;
    }
    // CHỈ kỳ đứng SAU anchor ("kỳ tiếp" đúng nghĩa thời gian) — KHÔNG gộp kỳ cũ hơn.
    const after = pending.filter((r) => r.drawId > anchorRow.drawId);
    // Anchor còn "Chưa có KQ" → đặt lên đầu hàng đợi; đã xử lý xong rồi (giữa phiên liên tiếp,
    // status đã đổi) → hàng đợi chỉ còn phần "sau" nó.
    const queue = anchorRow.status === DrawStatus.SalesClosed ? [anchorRow, ...after] : after;
    return queue.length > 0 ? queue.map(toPublishResultDraw) : undefined;
  }, [state.rows, publishAnchorId]);
  // Biến riêng để TS narrow đúng `PublishResultDraw` (không `| undefined`) — truy cập
  // `publishQueue[0]` trực tiếp trong JSX vẫn giữ union do `noUncheckedIndexedAccess`.
  const firstQueuedDraw = publishQueue?.[0];

  const canSelectRows = useMemo(() => rows5A.filter((r) => hasAnyAction(r, nowMs)), [rows5A, nowMs]);
  const selectedCount = canSelectRows.filter((r) => validSelection.has(r.drawId)).length;
  const allSelectableSelected = canSelectRows.length > 0 && selectedCount === canSelectRows.length;
  const isIndeterminate = selectedCount > 0 && !allSelectableSelected;

  function handleSort(key: QueueSortKey) {
    if (key === sortKey) {
      setUrlParams({ sort: key, dir: sortDir === QueueSortDir.Desc ? QueueSortDir.Asc : QueueSortDir.Desc });
    } else {
      setUrlParams({ sort: key, dir: QueueSortDir.Desc });
    }
  }

  function handleToggleAll() {
    if (allSelectableSelected) {
      actions.clearSelection();
    } else {
      actions.setSelection(new Set(canSelectRows.map((r) => r.drawId)));
    }
  }

  return (
    <section className="flex flex-col gap-2">
      {/* Tab bar — 5 tab, icon (bạn yêu cầu — plan §B5) + badge số đếm, phím tắt 1-5 xử lý ở
          `use-hub-keyboard.ts` (p1-02i). */}
      <div className="flex items-center gap-1 border-b" role="tablist">
        {HUB_GATE_TAB_ORDER.map((tab) => {
          const Icon = TAB_ICON[tab];
          return (
            <button
              key={tab}
              type="button"
              role="tab"
              aria-selected={activeTab === tab}
              onClick={() => setUrlParams({ gate: tab, sort: null, dir: null })}
              className={cn(
                "flex items-center gap-1.5 border-b-2 px-3 py-2 text-sm transition-colors",
                activeTab === tab
                  ? "border-primary font-medium text-foreground"
                  : "border-transparent text-muted-foreground hover:text-foreground",
              )}
            >
              <Icon className="size-3.5" />
              {HUB_GATE_TAB_LABELS[tab]}
              <span className="rounded-full bg-muted px-1.5 py-0.5 text-xs tabular-nums">{tabCounts[tab]}</span>
            </button>
          );
        })}
      </div>

      <div className="overflow-hidden rounded-lg border">
        {/* `max-h-[70vh] overflow-y-auto` (p1-07 §3b — chốt: theo viewport, không cố định px)
            — bảng "Tất cả" có thể lên tới 300 kỳ, không giới hạn chiều cao sẽ kéo trang dài vô
            hạn. `overflow-hidden` ở div NGOÀI (không phải trên chính scroll container) để bo góc
            `rounded-lg` không bị `TableHeader` sticky (nền `bg-card` full-width) đè mất 2 góc
            trên (review 08/09 §7: "mất border 2 góc trái/phải phía trên"). */}
        <div className="max-h-[70vh] overflow-y-auto">
          <Table>
            {/* `sticky top-0 z-10 bg-card` (guideline §1.7) — header dính khi cuộn bảng dài
              (100+ dòng, tab "Tất cả"). `bg-card` KHÔNG trong suốt để dòng dữ liệu không lộ
              qua header khi cuộn. */}
            <TableHeader className="sticky top-0 z-10 bg-card">
              <TableRow className="hover:bg-transparent">
                <TableHead className="w-8 pl-2">
                  {canSelectRows.length > 0 ? (
                    // Tooltip gợi ý Shift+Click chọn dải (round 4) — người dùng phải chọn hàng
                    // chục kỳ để bulk settle/close, click từng ô rất chậm. Đặt tooltip ở checkbox
                    // header vì đây là nơi mắt người dùng nhìn đầu tiên khi cần "chọn nhiều".
                    <Tooltip>
                      <TooltipTrigger asChild>
                        <Checkbox
                          checked={isIndeterminate ? "indeterminate" : allSelectableSelected}
                          onCheckedChange={handleToggleAll}
                          aria-label="Chọn tất cả"
                        />
                      </TooltipTrigger>
                      <TooltipContent side="top">Giữ Shift + click để chọn cả dải kỳ</TooltipContent>
                    </Tooltip>
                  ) : null}
                </TableHead>
                <TableHead>Kỳ</TableHead>
                <SortHeader
                  label="Giờ quay"
                  sortKey={QueueSortKey.DrawTime}
                  activeSortKey={sortKey}
                  activeSortDir={sortDir}
                  onSort={handleSort}
                />
                <TableHead>Trạng thái</TableHead>
                <SortHeader
                  label="Thời gian"
                  sortKey={QueueSortKey.AgeInStage}
                  activeSortKey={sortKey}
                  activeSortDir={sortDir}
                  onSort={handleSort}
                />
                <SortHeader
                  label="Doanh thu"
                  sortKey={QueueSortKey.Revenue}
                  activeSortKey={sortKey}
                  activeSortDir={sortDir}
                  align="right"
                  onSort={handleSort}
                />
                <TableHead className="text-right">Vé</TableHead>
                <TableHead className="text-right">Bộ</TableHead>
                {/* "Exposure"/"Alert" → Việt hoá (p1-07 §4e, đồng bộ với expand panel — cùng
                  khái niệm không nên có 2 ngôn ngữ khác nhau ở 2 nơi). */}
                <TableHead className="text-right">Rủi ro</TableHead>
                <TableHead className="pr-5">Cảnh báo</TableHead>
              </TableRow>
            </TableHeader>
            <TableBody>
              {rows5A.length === 0 ? (
                <TableRow>
                  <td colSpan={10} className="py-8 text-center text-muted-foreground text-sm">
                    Không có kỳ nào ở tab này.
                  </td>
                </TableRow>
              ) : (
                rows5A.map((row, rowIndex) => {
                  const { ageAnchorMs, remainingSec } = getAgeAnchor(row);
                  const isExpanded = expandedDrawId === row.drawId;
                  return (
                    <Fragment key={row.drawId}>
                      <QueueRow
                        drawId={row.drawId}
                        drawNo={row.drawNo}
                        rowIndex={rowIndex}
                        stageOrGateKey={row.gate === "pending_open" || row.gate === "halted" ? row.gate : row.stage}
                        healthKey={row.health}
                        ageAnchorMs={ageAnchorMs}
                        remainingSec={remainingSec}
                        reason={row.reason}
                        drawTimeMs={row.ts.drawTimeMs}
                        revenue={row.revenue}
                        entries={row.entries}
                        sets={row.sets}
                        exposureRaw={row.exposureRaw}
                        largeBetCount={row.largeBetCount}
                        alertsOpen={row.alertsOpen}
                        alertsCritical={row.alertsCritical}
                        accent={getRowAccent(row)}
                        canSelect={hasAnyAction(row, nowMs)}
                        isSelected={validSelection.has(row.drawId)}
                        errorMessage={rowErrors.get(row.drawId)}
                        isExpanded={isExpanded}
                        onToggleSelect={handleToggleSelect}
                        onCheckboxMouseDown={handleCheckboxMouseDown}
                        onToggleExpand={handleToggleExpand}
                      />
                      {/* Chỉ MOUNT panel của dòng đang mở — không render 30 panel rồi `hidden`
                        (plan p1-03 §3.2 điểm 1). `key` riêng biệt với dòng gốc để React không
                        coalesce 2 `<tr>` liên tiếp cùng key gốc. */}
                      {isExpanded ? (
                        <HubExpandPanel
                          row={row}
                          onClose={() => setExpandedDrawId(null)}
                          onOpenPublish={handleOpenPublish}
                        />
                      ) : null}
                    </Fragment>
                  );
                })
              )}
            </TableBody>
          </Table>
        </div>
      </div>

      {/* Dialog nhập kết quả tuần tự (p1-10) — mount ở CẤP BẢNG, xem JSDoc dài phía trên biến
          `publishOpen` giải thích vì sao KHÔNG mount trong `HubExpandPanel`. Không đóng `open`
          khi `publishQueue` rỗng (mọi kỳ trong hàng đợi đã publish xong) — để dialog TỰ đóng
          qua `submitCurrentDraw` (khi hết `nextDraw`) thay vì bị unmount đột ngột giữa lúc đang
          chạy animation đóng của Radix Dialog. */}
      {firstQueuedDraw && publishQueue ? (
        <PublishResultAction
          draw={firstQueuedDraw}
          disabled={false}
          open={publishOpen}
          onOpenChange={setPublishOpen}
          queue={publishQueue}
        />
      ) : null}
    </section>
  );
}
