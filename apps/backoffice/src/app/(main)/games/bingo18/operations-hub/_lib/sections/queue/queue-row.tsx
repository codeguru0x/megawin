"use client";

/**
 * Ops Hub — 1 dòng bảng 5A (plan §5, §6.2)
 *
 * `memo` với props CHỈ primitive (string/number/boolean) — KHÔNG nhận `DerivedRow` nguyên object
 * làm prop (object mới mỗi lần `deriveHubSummary` chạy lại dù giá trị dòng không đổi, phá
 * `memo` hoàn toàn — `vercel-react-best-practices` §5.5). Component cha destructure field cần
 * thiết từ `DerivedRow` rồi truyền primitive xuống.
 *
 * Age/countdown dùng `RelativeDuration` (DOM ref, tick riêng, KHÔNG re-render React mỗi giây —
 * `interval-registry.ts`). `content-visibility: auto` áp qua class `queue-row` (CSS global,
 * xem `hub-day-flow.tsx` tiền lệ) để trình duyệt skip layout/paint dòng ngoài viewport.
 *
 * Checkbox chọn dòng dùng NATIVE `<input>`, KHÔNG dùng `Checkbox` (Radix) — fix bug perf 09/09
 * vòng 2 (xem comment tại chỗ dùng bên dưới): Radix `Checkbox` → `usePresence` gọi
 * `getComputedStyle(node).animationName` (forced layout read) mỗi lần 1 checkbox `checked=true`
 * MOUNT. Bảng lọc dòng theo tab (`rows5A` ở `hub-queue-table.tsx`) nên đổi tab UNMOUNT/MOUNT LẠI
 * toàn bộ dòng của tab — không chỉ re-render. Với vài trăm dòng đã chọn, tổng chi phí mount lên
 * tới VÀI GIÂY (đo bằng CPU profile thật, không phải ước lượng) — xem `p1-09-expand-panel-redesign.plan.md` §14.
 */

import { memo } from "react";

import { formatDurationCompact, formatNumber } from "@megawin/shared/utils";
import { AlertTriangle, Lock } from "lucide-react";

import { DrawIdLabel } from "@/components/games/shared/draw-id-label";
import { Badge } from "@/components/ui/badge";
import { TableCell, TableRow } from "@/components/ui/table";
import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";
import { cn } from "@/lib/utils";

import { RelativeDuration } from "../../relative-duration";
import { OPS_STAGE_LABEL, SALE_GATE_LABEL } from "./queue-types";

const HEALTH_DOT_CLASS: Record<string, string> = {
  ok: "bg-emerald-500",
  warn: "bg-amber-500",
  stuck: "bg-destructive",
};

const ACCENT_ROW_CLASS: Record<string, string> = {
  none: "",
  warn: "bg-amber-500/5 hover:bg-amber-500/10",
  destructive: "bg-destructive/5 hover:bg-destructive/10",
};

export interface QueueRowProps {
  drawId: string;
  drawNo: number;
  /** Vị trí dòng này trong `rows5A` hiện tại — dùng để tính range khi Shift+Click (round 4,
   * kiểu chọn nhiều file macOS Finder). Primitive nên không phá `memo` (chỉ đổi khi thứ tự
   * dòng thực sự đổi do sort/filter — hợp lý phải re-render lúc đó). */
  rowIndex: number;
  /** `OpsStage` (chặng) khi `gate = Ended`, hoặc `SaleGate` (`pending_open`/`halted`) khi còn cứu được — 2 trục hiển thị gộp 1 badge (plan §5.1). */
  stageOrGateKey: string;
  healthKey: string;
  /** Giây kể từ mốc bắt đầu chặng — `null` khi đang ở gate còn cửa sổ (dùng `remainingSec` thay). */
  ageAnchorMs: number | null;
  /** Giây CÒN LẠI tới `closeAt` — chỉ có nghĩa khi `stageOrGateKey` là `pending_open`/`halted`. */
  remainingSec: number | null;
  reason: string;
  drawTimeMs: number;
  revenue: number;
  entries: number;
  sets: number;
  /** Exposure xấu nhất (VND) — `computeBingo18Exposure` lúc đọc; Bingo18 không có payout cap kỳ. */
  exposureRaw: number;
  largeBetCount: number;
  alertsOpen: number;
  alertsCritical: number;
  accent: "none" | "warn" | "destructive";
  /** `undefined` = không render checkbox (dòng không có action nào khả dụng — plan §5.3). */
  canSelect: boolean;
  isSelected: boolean;
  /** Lỗi bulk action gần nhất trên dòng này, `undefined` = không có lỗi. */
  errorMessage: string | undefined;
  /** Dòng này đang mở inline expand panel (plan p1-03 §3.2) — đổi kiểu highlight nhẹ khi mở. */
  isExpanded: boolean;
  /** Chọn 1 dòng. `shiftKey` truyền qua `onCheckboxMouseDown` (bắt ở `mousedown`, XẢY RA TRƯỚC
   * `click`/`onCheckedChange` của Radix Checkbox — không thể lấy `shiftKey` từ chính
   * `onCheckedChange` vì callback đó chỉ nhận `boolean`, không có event gốc). Bảng cha
   * (`hub-queue-table.tsx`) đọc ref này để quyết định chọn 1 dòng hay cả dải (round 4).
   * `wasSelected` = trạng thái CHECKBOX NÀY trước khi bấm — cho bảng cha biết Shift+Click lần
   * này là "mở rộng chọn" hay "mở rộng BỎ chọn" (round 4 v2 — Finder thật: Shift+Click 1 ô đã
   * chọn sẽ BỎ chọn cả dải, không chỉ luôn cộng thêm 1 chiều như bản trước). */
  onToggleSelect: (drawId: string, rowIndex: number, wasSelected: boolean) => void;
  onCheckboxMouseDown: (shiftKey: boolean) => void;
  /** Click DÒNG (không phải checkbox/nút) → toggle inline expand panel — KHÔNG mở tab mới (plan p1-03 §2, §3.2). */
  onToggleExpand: (drawId: string) => void;
}

/**
 * Badge alert — chỉ dùng tổng số ĐANG CÓ (`alertsOpen`/`alertsCritical`), KHÔNG bịa breakdown
 * theo loại alert (VD "2 cược lớn · 1 lệch side bet") vì hub-snapshot DTO hiện chỉ trả tổng số,
 * không trả theo `Bingo18OpsAlertType` (xem `hub-snapshot.dto.ts` — `alertsOpen`/`alertsCritical`
 * là 2 field duy nhất). Muốn breakdown theo loại phải sửa aggregation ở repo — ngoài phạm vi
 * redesign UI thuần (p1-05). Tooltip nói ĐÚNG cái đang có: tổng số + mức độ, không nói quá.
 */
function AlertBadge({ alertsOpen, alertsCritical }: { alertsOpen: number; alertsCritical: number }) {
  if (alertsOpen === 0) {
    return null;
  }
  const nonCritical = alertsOpen - alertsCritical;
  const tooltipText =
    alertsCritical > 0
      ? nonCritical > 0
        ? `${alertsCritical} alert nghiêm trọng, ${nonCritical} alert khác đang mở`
        : `${alertsCritical} alert nghiêm trọng đang mở`
      : `${alertsOpen} alert đang mở`;

  return (
    <Tooltip>
      <TooltipTrigger asChild>
        <Badge variant={alertsCritical > 0 ? "destructive" : "secondary"} className="gap-1 text-xs">
          <AlertTriangle className="size-3" />
          {alertsOpen}
        </Badge>
      </TooltipTrigger>
      <TooltipContent>{tooltipText}</TooltipContent>
    </Tooltip>
  );
}

/**
 * Tooltip icon khoá (thay ô checkbox khi `canSelect = false`) — ĐỘNG theo `stageOrGateKey`
 * thực tế, KHÔNG dùng 1 câu tĩnh cho mọi trường hợp (p1-08 §1.6/§6: câu cũ "Đã xử lý xong" SAI
 * cho `awaiting_result` — kỳ đó CHỜ NHẬP KẾT QUẢ, không phải đã xong). Bảng tra theo đúng
 * `OpsStage`/`SaleGate` key hiện có trong `queue-types.ts`, KHÔNG thêm state mới.
 */
function lockedReason(stageOrGateKey: string): string {
  switch (stageOrGateKey) {
    case "awaiting_draw":
      return "Đã đóng bán, đang chờ tới giờ quay số — chưa cần hành động.";
    case "awaiting_result":
      return "Chưa có kết quả quay số — cần nhập kết quả (mở chi tiết kỳ để nhập).";
    case "settling":
      return "Đang kết sổ — hệ thống tự xử lý, chờ vài giây.";
    case "voiding":
      return "Đang huỷ kỳ — hệ thống tự xử lý, chờ vài giây.";
    case "never_opened":
      return "Quá giờ mở bán — không mở bán lại được. Mở chi tiết kỳ rồi sang trang vận hành để huỷ.";
    default:
      return "Không có hành động hàng loạt cho kỳ này — mở chi tiết kỳ để xử lý.";
  }
}

function QueueRowImpl(props: QueueRowProps) {
  const {
    drawId,
    drawNo,
    rowIndex,
    stageOrGateKey,
    healthKey,
    ageAnchorMs,
    remainingSec,
    reason,
    drawTimeMs,
    revenue,
    entries,
    sets,
    exposureRaw,
    largeBetCount,
    alertsOpen,
    alertsCritical,
    accent,
    canSelect,
    isSelected,
    errorMessage,
    isExpanded,
    onToggleSelect,
    onCheckboxMouseDown,
    onToggleExpand,
  } = props;

  const stageLabel = OPS_STAGE_LABEL[stageOrGateKey] ?? SALE_GATE_LABEL[stageOrGateKey] ?? stageOrGateKey;

  return (
    <TableRow
      id={`hub-row-${drawId}`}
      data-state={isSelected ? "selected" : undefined}
      className={cn("queue-row cursor-pointer", isExpanded ? "bg-muted/40" : ACCENT_ROW_CLASS[accent])}
      onClick={() => onToggleExpand(drawId)}
    >
      <TableCell className="w-8 py-2" onClick={(e) => e.stopPropagation()}>
        {canSelect ? (
          // Fix bug perf (09/09 vòng 2) — NATIVE `<input>`, KHÔNG dùng `Checkbox` (Radix) ở đây.
          // Đo bằng CPU profile thật (Cursor Browser, `Profiler.start/stop`): switch tab đi rồi
          // quay lại tab có 173 dòng đã chọn tốn ~3.3s, trong đó ~2.5s là self-time của
          // `getAnimationName` bên trong `@radix-ui/react-checkbox` → `usePresence` — hàm này gọi
          // `getComputedStyle(node).animationName`, một forced style/layout read, chạy 1 lần cho
          // MỖI checkbox `checked=true` khi nó MOUNT (không phải re-render). Control test: 0 dòng
          // chọn → 209ms, 173 dòng chọn → 3.3s — chi phí tỉ lệ thuận số checkbox CHECKED, không
          // phải do `content-visibility:auto` (tắt CV vẫn ~3.1s, không giảm).
          //
          // Gốc: đổi tab lọc lại `rows5A` theo `activeTab` (`hub-queue-table.tsx`) → đổi tab KHÔNG
          // CHỈ re-render, mà UNMOUNT toàn bộ dòng tab cũ rồi MOUNT LẠI toàn bộ dòng tab mới (key
          // `drawId` khác hoàn toàn giữa 2 tab) — quay lại tab cũ = mount lại từ đầu, dù dữ liệu
          // dòng không đổi (đúng câu hỏi bạn nêu: "kỳ không đổi sao phải re-render" — thực ra đây
          // là mount, không phải re-render, và cái tốn tiền là side-effect mount của Radix
          // Checkbox, KHÔNG phải render logic của `QueueRow`/`memo` — 2 fix trước (useCallback
          // deps) xử lý đúng bug re-render nhưng không chạm tới bug mount này).
          //
          // Native `<input type="checkbox">` không có Presence/animation state machine → không
          // forced style read khi mount → loại bỏ hẳn root cause, KHÔNG chỉ giảm nhẹ. Header
          // "Chọn tất cả" (`hub-queue-table.tsx`, chỉ 1 instance/trang) giữ nguyên Radix `Checkbox`
          // — cần `indeterminate` state mà native input không hỗ trợ qua prop (phải set qua DOM
          // ref), và chi phí 1 instance không đáng kể.
          <input
            type="checkbox"
            checked={isSelected}
            onMouseDown={(e) => onCheckboxMouseDown(e.shiftKey)}
            onChange={() => onToggleSelect(drawId, rowIndex, isSelected)}
            aria-label={`Chọn kỳ ${drawNo}`}
            className="size-4 shrink-0 cursor-pointer rounded-[4px] border-input accent-primary"
          />
        ) : (
          // Kỳ không có action bulk khả dụng — icon Lock xám thay ô trống hoàn toàn, tránh
          // cảm giác "thiếu sót UI" (p1-07 §3a). Tooltip ĐỘNG theo `stageOrGateKey` thực tế
          // (p1-08 §1.6: câu tĩnh cũ "Đã xử lý xong" sai cho `awaiting_result` — kỳ đó CHỜ
          // NHẬP KẾT QUẢ, không phải đã xong).
          <Tooltip>
            <TooltipTrigger asChild>
              <Lock className="size-3.5 text-muted-foreground/40" />
            </TooltipTrigger>
            <TooltipContent>{lockedReason(stageOrGateKey)}</TooltipContent>
          </Tooltip>
        )}
      </TableCell>
      <TableCell className="py-2">
        <DrawIdLabel drawId={drawId} />
      </TableCell>
      <TableCell className="py-2 text-muted-foreground text-xs tabular-nums">
        {new Date(drawTimeMs).toLocaleTimeString("vi-VN", { hour: "2-digit", minute: "2-digit" })}
      </TableCell>
      <TableCell className="py-2">
        <div className="flex items-center gap-1.5" title={reason}>
          <span className={cn("size-1.5 shrink-0 rounded-full", HEALTH_DOT_CLASS[healthKey])} />
          <span className="text-xs">{stageLabel}</span>
        </div>
      </TableCell>
      <TableCell className="py-2 text-xs tabular-nums">
        {remainingSec !== null ? (
          <span className={healthKey === "stuck" ? "font-medium text-destructive" : undefined}>
            còn {formatDurationCompact(remainingSec)}
          </span>
        ) : ageAnchorMs !== null ? (
          <RelativeDuration
            sinceMs={ageAnchorMs}
            className={healthKey === "stuck" ? "font-medium text-destructive" : undefined}
          />
        ) : (
          "—"
        )}
      </TableCell>
      <TableCell className="py-2 text-right tabular-nums">{formatNumber(revenue)}</TableCell>
      {/* Tách "Vé" và "Bộ" thành 2 cột riêng, bỏ hậu tố "v"/"b" — đơn vị đã ghi ở header cột,
          lặp lại ở 200 dòng chỉ tốn chiều ngang (yêu cầu review 07/09, plan §B5). */}
      <TableCell className="py-2 text-right text-muted-foreground text-xs tabular-nums">
        {formatNumber(entries)}
        {largeBetCount > 0 ? (
          <Tooltip>
            <TooltipTrigger asChild>
              <span className="ml-1 cursor-default text-amber-600">+{largeBetCount}</span>
            </TooltipTrigger>
            <TooltipContent>{largeBetCount} cược lớn (≥ ngưỡng cấu hình)</TooltipContent>
          </Tooltip>
        ) : null}
      </TableCell>
      <TableCell className="py-2 text-right text-muted-foreground text-xs tabular-nums">{formatNumber(sets)}</TableCell>
      {/* Cột Exposure — rủi ro chi trả worst-case per-kỳ (Bingo18 không có payout cap). */}
      <TableCell className="py-2 text-right text-muted-foreground text-xs tabular-nums">
        {exposureRaw > 0 ? formatNumber(exposureRaw) : "—"}
      </TableCell>
      <TableCell className="py-2 pr-5">
        <AlertBadge alertsOpen={alertsOpen} alertsCritical={alertsCritical} />
        {errorMessage ? (
          <div className="mt-1 max-w-48 truncate text-destructive text-xs" title={errorMessage}>
            ⚠ {errorMessage}
          </div>
        ) : null}
      </TableCell>
    </TableRow>
  );
}

/**
 * `memo` mặc định (shallow compare props) — vì TOÀN BỘ props ở đây là primitive, shallow compare
 * chính là deep compare. Không cần comparator tuỳ chỉnh.
 */
export const QueueRow = memo(QueueRowImpl);
