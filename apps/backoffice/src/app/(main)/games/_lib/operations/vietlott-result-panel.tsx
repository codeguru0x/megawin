import type { ReactNode } from "react";

import { CheckCircle2, Loader2, TriangleAlert, WandSparkles } from "lucide-react";

import { Button } from "@/components/ui/button";
import { cn } from "@/lib/utils";

import type { ResultNumbersDiff } from "./result-numbers-diff";
import { VietlottTrustBadge } from "./vietlott-trust-badge";

/**
 * Khối trạng thái DUY NHẤT cho tính năng tự lấy kết quả Vietlott (ResultFeed) — thay thế
 * `vietlott-result-status.tsx` (deprecated, xem JSDoc file đó). 1 khung box cố định
 * (`rounded-lg border px-3.5 py-2.5`, layout `flex items-center gap-2.5`), chỉ đổi màu + icon +
 * nội dung theo state — tránh cảm giác rời rạc như trước (nhiều khối UI khác style xếp dọc).
 *
 * 6 state, đúng bảng đặc tả `09-result-autofill-ux-redesign.plan.md §6.3`:
 * `hidden` (không render) → `loading` → `not-found` | `filled` | `match` | `conflict`.
 *
 * KHÔNG tự quyết định autofill/apply — chỉ hiển thị theo state do caller truyền vào
 * (`useVietlottResult` hook + logic tự-điền-nếu-rỗng + `diffResultNumbers` của từng form).
 * Icon tin cậy (`VietlottTrustBadge`) chỉ hiện ở state `filled`/`match` — chỉ phân biệt máy tự
 * chốt hay người xác nhận, KHÔNG hiện số nguồn đối chiếu.
 *
 * Dùng CHUNG cho dialog công bố/sửa kết quả của cả 7 game.
 */
export function VietlottResultPanel({
  isLoading,
  found,
  hasAnyNumber,
  alreadyApplied,
  diff,
  totalCount,
  verifiedByHuman,
  onApply,
}: {
  isLoading: boolean;
  found: boolean | undefined;
  /** `numbers.some(n => n.trim() !== "")` — form đã có ít nhất 1 số (dù chưa đủ). */
  hasAnyNumber: boolean;
  /** Vừa autofill (form rỗng lúc mở) hoặc vừa bấm "Áp dụng" — phân biệt với `match` (user tự gõ khớp). */
  alreadyApplied: boolean;
  /** `null` khi chưa có `incomingNumbers` để so (found = false/undefined). */
  diff: ResultNumbersDiff | null;
  /** Tổng số ô của game này (VD 20 với Keno) — dùng hiện `"{n}/{totalCount} số khác"`. */
  totalCount: number;
  verifiedByHuman: boolean | null;
  /**
   * Không dùng trong panel — chỉ giữ trong contract để KHÔNG phải sửa 7 file game truyền prop
   * này (`vietlottResultQuery.data?.sourceCount`). `VietlottTrustBadge` không hiện thông tin
   * số nguồn (quyết định user — staff không cần chi tiết này).
   */
  sourceCount: number | null;
  onApply: () => void;
}) {
  if (isLoading) {
    return (
      <PanelBox tone="muted">
        <Loader2 className="size-3.5 shrink-0 animate-spin text-muted-foreground" />
        <p className="text-muted-foreground text-sm">Đang tìm kết quả …</p>
      </PanelBox>
    );
  }

  if (found === undefined) {
    return null;
  }

  if (!found) {
    return (
      <PanelBox tone="amber">
        <TriangleAlert className="size-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
        <p className="font-medium text-amber-800 text-sm dark:text-amber-300">
          Chưa có kết quả cho kỳ này — bạn hãy tự nhập.
        </p>
      </PanelBox>
    );
  }

  if (alreadyApplied) {
    return (
      <PanelBox tone="emerald">
        <WandSparkles className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="flex flex-1 items-center justify-between gap-2">
          <p className="text-emerald-800 text-sm dark:text-emerald-300">Đã điền kết quả tự động.</p>
          {verifiedByHuman !== null && <VietlottTrustBadge verifiedByHuman={verifiedByHuman} />}
        </div>
      </PanelBox>
    );
  }

  // Form rỗng, chưa kịp autofill (khoảnh khắc transient giữa lúc query trả `found = true` và
  // effect tự điền chạy) — không render gì, tránh nhấp nháy khối "conflict" 20/20 số khác.
  if (!hasAnyNumber || !diff) {
    return null;
  }

  if (diff.isIdentical) {
    return (
      <PanelBox tone="emerald">
        <CheckCircle2 className="size-3.5 shrink-0 text-emerald-600 dark:text-emerald-400" />
        <div className="flex flex-1 items-center justify-between gap-2">
          <p className="text-emerald-800 text-sm dark:text-emerald-300">Kết quả đang nhập khớp với Vietlott.</p>
          {verifiedByHuman !== null && <VietlottTrustBadge verifiedByHuman={verifiedByHuman} />}
        </div>
      </PanelBox>
    );
  }

  return (
    <PanelBox tone="amber">
      <TriangleAlert className="size-3.5 shrink-0 text-amber-700 dark:text-amber-400" />
      <div className="flex flex-1 items-center justify-between gap-2">
        <p className="text-amber-800 text-sm dark:text-amber-300">
          {diff.sameSetDifferentOrder
            ? "Cùng tập số, khác thứ tự quay."
            : `${diff.diffCount}/${totalCount} số khác Vietlott.`}
        </p>
        <Button
          type="button"
          size="sm"
          onClick={onApply}
          className="shrink-0 gap-1.5 bg-amber-600 text-white hover:bg-amber-700 dark:bg-amber-600 dark:hover:bg-amber-700"
        >
          <WandSparkles className="size-3.5" />
          Áp dụng
        </Button>
      </div>
    </PanelBox>
  );
}

function PanelBox({ tone, children }: { tone: "muted" | "amber" | "emerald"; children: ReactNode }) {
  return (
    <div
      className={cn(
        "flex items-center gap-2.5 rounded-lg border px-3.5 py-2.5",
        tone === "muted" && "border-border bg-muted/30",
        tone === "amber" && "border-amber-300/60 bg-amber-50 dark:border-amber-700/60 dark:bg-amber-900/20",
        tone === "emerald" && "border-emerald-300/60 bg-emerald-50 dark:border-emerald-700/60 dark:bg-emerald-900/20",
      )}
    >
      {children}
    </div>
  );
}
