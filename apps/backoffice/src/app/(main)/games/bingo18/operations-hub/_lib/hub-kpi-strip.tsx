"use client";

/**
 * Ops Hub — Zone 2: KPI Strip (p1-07 §8.3, §10 — viết lại lần 2, thay hoàn toàn bản P1-05)
 *
 * BẢN P1-05 CŨ hiện 4 card đếm số kỳ ("Cần xử lý" → "Chờ kết sổ") — nhưng con số đó
 * **TRÙNG 100%** với badge đã hiện sẵn trên tab bar `hub-queue-table.tsx` ngay dưới. User chỉ
 * ra đúng: KPI không nên lặp lại số đã có, mà phải cho biết dữ liệu KHÔNG có ở đâu khác —
 * tổng tiền/vé/rủi ro đang bị Hub theo dõi, và trong đó BAO NHIÊU là tồn đọng (đã hết giờ
 * cược, đang chờ xử lý) so với tổng toàn bộ.
 *
 * Quyết định cuối (plan §10):
 * 1. Bỏ hẳn 4 card đếm kỳ (đếm theo tab) — đã có đủ ở badge tab bar ngay dưới.
 * 2. 3 card TÀI CHÍNH: Tổng tiền cược / Tổng số vé / Rủi ro chi trả — mỗi card `value` = tổng
 *    TOÀN BỘ kỳ Hub đang theo dõi, `sub` = phần THUỘC tồn đọng (gate !== Open).
 * 3. Bỏ hẳn `active`/ring/click — 3 card không tương ứng 1 tab cụ thể (dữ liệu tổng hợp,
 *    không phải bộ lọc) nên "trạng thái đang chọn" không có ý nghĩa (user: "ko phải KPI nào
 *    cũng click được").
 * 4. P1-08 §4 Q3 (chốt 08/09): thêm card thứ 4 "Đang bán" — Phương án B (không nhồi thêm dòng
 *    vào 3 card cũ). Dữ liệu LẤY THẲNG từ `state.selling` (đã tính sẵn ở `deriveHubSummary`,
 *    0 vòng lặp mới) — số kỳ đang mở bán + doanh thu TB/kỳ, hiện chỉ nằm ở tiêu đề Zone 5B phía
 *    dưới màn hình, chưa có ở khu tổng quan đầu trang. Card này CÓ Ý NGHĨA khác 3 card tài
 *    chính (đang diễn ra, không phải tồn đọng) nên KHÔNG dùng `pendingSub` — sub riêng.
 * 5. P1-09 §4 (chốt 08/09): thêm card thứ 5 "Hoa hồng đại lý", đặt NGAY SAU "Tổng tiền cược"
 *    (hoa hồng là phái sinh của doanh thu — đọc liền nhau mới so được tỷ lệ). Grid đổi
 *    `sm:grid-cols-4` → `sm:grid-cols-2 lg:grid-cols-5` để 5 card vẫn 1 hàng ở màn hình vận
 *    hành (≥1024px), giữ chiều cao strip 72px như trước.
 *
 *    Con số là **THẬT** (`totals.commission`, worker `$inc` mỗi tick từ
 *    `entry.tenant.commissionAmount` — rate riêng từng tenant), KHÔNG phải
 *    `revenue × defaultCommissionRate`: công thức ước tính đó sai ngay khi có 1 tenant được
 *    `TenantConfigDoc.commissionRate` override. Vì là số thật nên nhãn KHÔNG ghi "ước tính";
 *    giới hạn duy nhất (chưa chốt tới khi kết sổ) nói qua `tooltip`.
 *
 * `exposureRaw` Bingo18 = worst-case chi trả tính lúc đọc (`computeBingo18Exposure`) — game
 * **không có** `payoutCaps`, nên nhãn KPI chỉ "Rủi ro chi trả" (KHÔNG gắn "(chưa cap)" như Keno).
 * Cảnh báo dùng `exposureWarnRevenuePct` (% doanh thu kỳ), không phải ngưỡng sau-cap.
 */

import { useMemo } from "react";

import { formatNumber, formatVNDCompact } from "@megawin/shared/utils";
import { AlertTriangle, Percent, Radio, Ticket, Wallet } from "lucide-react";

import { Tooltip, TooltipContent, TooltipTrigger } from "@/components/ui/tooltip";

import { SaleGate } from "./derive-draw-state";
import { useHubContext } from "./use-hub-context";

// ─── Aggregation: tổng + phần tồn đọng, 1 vòng lặp riêng cho Zone 2 ────────────────────────

interface KpiMoneyBreakdown {
  /** Tổng TOÀN BỘ kỳ Hub đang theo dõi (mọi gate). */
  total: number;
  /** Phần thuộc kỳ ĐÃ hết giờ cược (`gate !== Open`) — "tồn đọng chưa xử lý". */
  pending: number;
}

interface HubKpiStats {
  revenue: KpiMoneyBreakdown;
  /** Hoa hồng đại lý (p1-09 §4) — SỐ THẬT từ `totals.commission`, không phải `revenue × rate`. */
  commission: KpiMoneyBreakdown;
  entries: KpiMoneyBreakdown;
  exposure: KpiMoneyBreakdown;
  /** Tổng alert `critical` chưa resolved trên toàn bộ kỳ đang theo dõi. */
  alertsCritical: number;
}

function emptyBreakdown(): KpiMoneyBreakdown {
  return { total: 0, pending: 0 };
}

function addToBreakdown(group: KpiMoneyBreakdown, value: number, isPending: boolean): void {
  group.total += value;
  if (isPending) {
    group.pending += value;
  }
}

/**
 * 1 vòng lặp riêng qua `state.rows` để cộng dồn tiền/vé/exposure theo 2 nhóm (tổng vs tồn
 * đọng) — tách khỏi vòng lặp chính `deriveHubSummary` vì đây là dữ liệu CHỈ Zone 2 cần
 * (guideline §5.5 áp dụng cục bộ), và KHÔNG thêm query nào (toàn bộ field đã có sẵn trên
 * `DerivedRow` từ 1 lần fetch snapshot).
 */
function useHubKpiStats(): HubKpiStats {
  const { state } = useHubContext();

  return useMemo(() => {
    const revenue = emptyBreakdown();
    const commission = emptyBreakdown();
    const entries = emptyBreakdown();
    const exposure = emptyBreakdown();
    let alertsCritical = 0;

    for (const row of state.rows) {
      // "Tồn đọng" = kỳ đã hết giờ cược, không còn ở trạng thái bán bình thường — đúng định
      // nghĩa user nêu ("các kỳ chờ xử lý đã hết giờ cược").
      const isPending = row.gate !== SaleGate.Open;
      addToBreakdown(revenue, row.revenue, isPending);
      addToBreakdown(commission, row.commission, isPending);
      addToBreakdown(entries, row.entries, isPending);
      addToBreakdown(exposure, row.exposureRaw, isPending);
      alertsCritical += row.alertsCritical;
    }

    return { revenue, commission, entries, exposure, alertsCritical };
  }, [state.rows]);
}

// ─── KPI Card ───────────────────────────────────────────────────────────────────

interface KpiCardProps {
  icon: React.ComponentType<{ className?: string }>;
  iconBg: string;
  iconColor: string;
  label: string;
  value: string;
  sub: string;
  /**
   * Giải thích thêm khi con số cần cảnh báo về ĐỘ CHỐT (p1-09 §4.5).
   *
   * Chỉ card "Hoa hồng đại lý" dùng: số là thật nhưng CHƯA chốt (kỳ đang bán còn tăng, số chốt
   * chỉ có sau kết sổ). 3 card kia không truyền → hành vi giữ nguyên như trước, không bọc
   * `Tooltip` (tránh thêm 3 wrapper DOM vô ích cho card không cần).
   */
  tooltip?: string;
}

/** Card TĨNH — KHÔNG `onClick`/`active` (quyết định §10: dữ liệu tổng hợp, không phải bộ lọc). */
function KpiCard({ icon: Icon, iconBg, iconColor, label, value, sub, tooltip }: KpiCardProps) {
  const card = (
    <div className="flex h-[72px] items-center gap-3 rounded-xl border bg-card p-4 shadow-sm">
      <div className={`flex size-10 shrink-0 items-center justify-center rounded-lg ${iconBg}`}>
        <Icon className={`size-5 ${iconColor}`} />
      </div>
      <div className="min-w-0 flex-1">
        <p className="truncate font-medium text-muted-foreground text-xs">{label}</p>
        <p className="truncate font-bold text-lg tabular-nums leading-tight">{value}</p>
        <p className="truncate text-muted-foreground text-xs">{sub}</p>
      </div>
    </div>
  );

  if (tooltip === undefined) {
    return card;
  }

  return (
    <Tooltip>
      {/* `asChild` — card đã là `div` block-level, KHÔNG bọc thêm `button` (card không click được,
          bọc button sẽ báo cho screen reader là interactive trong khi nó không phải). */}
      <TooltipTrigger asChild>{card}</TooltipTrigger>
      <TooltipContent side="bottom" className="max-w-xs">
        {tooltip}
      </TooltipContent>
    </Tooltip>
  );
}

/** Sub-text breakdown tồn đọng — 1 dòng cố định, "Không tồn đọng" khi phần pending = 0
 * (KHÔNG để trống — quy tắc bất biến "đúng 1 dòng sub" đã chốt từ P1-05). */
function pendingSub(pending: number, formatter: (n: number) => string, unit: string): string {
  if (pending <= 0) {
    return "Không tồn đọng";
  }
  return `${formatter(pending)}${unit} tồn đọng`;
}

// ─── Root Zone 2 ────────────────────────────────────────────────────────────────

export function HubKpiStrip() {
  const { state } = useHubContext();
  const stats = useHubKpiStats();
  const { selling } = state;

  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      <KpiCard
        icon={Wallet}
        iconBg="bg-emerald-100 dark:bg-emerald-900/50"
        iconColor="text-emerald-600 dark:text-emerald-400"
        label="Tổng tiền cược"
        value={formatVNDCompact(stats.revenue.total)}
        sub={pendingSub(stats.revenue.pending, formatVNDCompact, "")}
      />
      {/* Card "Hoa hồng đại lý" (p1-09 §4, chốt 08/09) — đặt NGAY SAU "Tổng tiền cược" theo yêu
          cầu: hoa hồng là phái sinh trực tiếp của doanh thu nên đọc liền nhau mới so được tỷ lệ.
          Dùng ĐÚNG `pendingSub` như 3 card tài chính (value = tổng, sub = phần tồn đọng của kỳ đã
          hết giờ cược) — cùng ngữ nghĩa, không phát minh format sub riêng.
          `row.commission` là SỐ THẬT cộng dồn per-entry theo rate riêng từng tenant, KHÔNG phải
          `revenue × defaultCommissionRate` (công thức đó sai khi tenant override rate — xem JSDoc
          `OpsHubDrawRow.commission`).
          Format tiền/count đồng bộ với reports/settle: `formatVNDCompact` (KPI tiền) +
          `formatNumber` (KPI count) — KHÔNG dùng `formatMoneyCompact`/`formatNumberVN`. */}
      <KpiCard
        icon={Percent}
        iconBg="bg-amber-100 dark:bg-amber-900/50"
        iconColor="text-amber-600 dark:text-amber-400"
        label="Hoa hồng đại lý"
        value={formatVNDCompact(stats.commission.total)}
        sub={pendingSub(stats.commission.pending, formatVNDCompact, "")}
        tooltip="Hoa hồng cộng dồn từ vé đã bán, theo tỷ lệ thật của từng đại lý. Kỳ đang bán số còn tăng; số chốt chỉ có sau khi kết sổ."
      />
      <KpiCard
        icon={Ticket}
        iconBg="bg-blue-100 dark:bg-blue-900/50"
        iconColor="text-blue-600 dark:text-blue-400"
        label="Tổng số vé"
        value={`${formatNumber(stats.entries.total)} vé`}
        sub={pendingSub(stats.entries.pending, formatNumber, " vé")}
      />
      <KpiCard
        icon={AlertTriangle}
        iconBg="bg-rose-100 dark:bg-rose-900/50"
        iconColor="text-rose-600 dark:text-rose-400"
        label="Rủi ro chi trả"
        value={formatVNDCompact(stats.exposure.total)}
        sub={stats.alertsCritical > 0 ? `${stats.alertsCritical} cảnh báo nghiêm trọng` : "Bình thường"}
        tooltip="Worst-case chi trả nếu mọi outcome xấu nhất cùng lúc. Bingo18 không áp payout cap theo kỳ — đây là số đầy đủ, không phải bản 'trước cap' như Keno."
      />
      {/* Card thứ 4 "Đang bán" (p1-08 §4 Q3, Phương án B) — dữ liệu lấy thẳng từ `state.selling`
          (Zone 5B, đã tính sẵn ở `deriveHubSummary`, 0 vòng lặp mới). Ý nghĩa KHÁC 3 card trên
          (đang diễn ra, không phải tồn đọng) nên `sub` không dùng `pendingSub`. */}
      <KpiCard
        icon={Radio}
        iconBg="bg-violet-100 dark:bg-violet-900/50"
        iconColor="text-violet-600 dark:text-violet-400"
        label="Đang bán"
        value={`${formatNumber(selling.count)} kỳ`}
        sub={
          selling.count > 0 ? `Doanh thu TB ${formatVNDCompact(selling.avgRevenuePerDraw)}/kỳ` : "Không có kỳ đang bán"
        }
      />
    </div>
  );
}

export function HubKpiStripSkeleton() {
  // 5 ô — PHẢI khớp số card thật ở `HubKpiStrip` (p1-09 §6.3): skeleton lệch số ô làm layout
  // nhảy đúng lúc data về, đó là thời điểm mắt đang nhìn vào khu này.
  return (
    <div className="grid gap-3 sm:grid-cols-2 lg:grid-cols-5">
      {[0, 1, 2, 3, 4].map((i) => (
        <div key={i} className="h-[72px] animate-pulse rounded-xl border bg-card p-4 shadow-sm" />
      ))}
    </div>
  );
}
