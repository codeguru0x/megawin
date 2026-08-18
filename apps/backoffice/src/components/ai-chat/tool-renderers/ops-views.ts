"use client";

/**
 * AI Chat — spec hiển thị cho `getDrawsOverview` (tầng 1, xem `view-spec.ts`).
 *
 * Tách khỏi `report-views.ts` vì đây là dữ liệu SỰ KIỆN vận hành (draw timeline), không phải báo
 * cáo tài chính — cùng lý do phân domain với `server/ai/draws|operations|integration` (không dồn
 * hết vào `reports/`).
 *
 * `getOpsSnapshot` và `getIntegrationHealth` KHÔNG có spec ở đây — output nhiều khối/nhiều bảng
 * khác nhau mà 1 `ToolView` (table/kpi/keyValue) không mô tả nổi cùng lúc, viết ở
 * `daily-ops-cards.tsx` (Tier 2 bespoke, xem ranh giới cứng đầu `view-spec.ts`).
 */

import { GAME_LABELS } from "@megawin/game-core/labels";

import type { GetDashboardDrawsOutput } from "@/server/use-cases/draws/types";

import { CellFormat } from "./format-cell";
import { defineToolView } from "./view-spec";

/** `gameProduct` ở output là `string` thô (không phải `GameProduct` enum) — tra nhãn có fallback về chính ID khi gặp giá trị lạ. */
function gameLabel(gameProduct: string): string {
  return GAME_LABELS[gameProduct as keyof typeof GAME_LABELS] ?? gameProduct;
}

/** Nhãn tiếng Việt cho `DrawEventStatus` — dùng riêng ở đây, KHÔNG trùng `DRAW_STATUS_LABELS` (đó là `DrawStatus` chi tiết, đây là 3 nhóm gộp cho overview). */
const EVENT_STATUS_LABELS: Record<GetDashboardDrawsOutput["events"][number]["status"], string> = {
  active: "Đang diễn ra",
  settled: "Vừa hoàn thành",
  scheduled: "Sắp diễn ra",
};

/** `"2026-08-17T09:30:00.000Z"` → `"17/08 09:30"` — ngắn hơn ISO đầy đủ cho 1 ô bảng hẹp. */
function formatWhenLabel(iso: string): string {
  if (iso.length < 16 || !iso.includes("T")) {
    return iso;
  }
  return `${iso.slice(8, 10)}/${iso.slice(5, 7)} ${iso.slice(11, 16)}`;
}

/** 1 dòng hiển thị của `getDrawsOverview` — gộp `events` (lottery) và `highFreqGames` (keno/bingo18). */
interface DrawsOverviewRow {
  gameLabel: string;
  statusLabel: string;
  drawLabel: string;
  whenLabel: string;
  pendingStake: number;
}

/**
 * `getDrawsOverview` — bảng cross-game gộp cả 2 shape output (`events` chi tiết từng kỳ của game
 * tần suất thấp, `highFreqGames` summary số lượng của Keno/Bingo18) vào CÙNG 1 bảng vì cả 2 đều
 * là "1 dòng = 1 game đang ở trạng thái gì" — khác biệt duy nhất là `drawLabel`/`whenLabel` là số
 * đơn lẻ hay số gộp, KHÔNG cần 2 `ToolView` riêng.
 */
export const drawsOverviewView = defineToolView<GetDashboardDrawsOutput, DrawsOverviewRow>({
  select: (output) => {
    const eventRows: DrawsOverviewRow[] = output.events.map((event) => ({
      gameLabel: gameLabel(event.gameProduct),
      statusLabel: EVENT_STATUS_LABELS[event.status],
      drawLabel: event.drawId,
      whenLabel: formatWhenLabel(event.drawAt),
      pendingStake: event.pendingStake ?? 0,
    }));
    const highFreqRows: DrawsOverviewRow[] = output.highFreqGames.map((g) => ({
      gameLabel: gameLabel(g.gameProduct),
      statusLabel: "Tần suất cao",
      drawLabel: `${g.activeCount} đang mở · ${g.scheduledCount} sắp mở`,
      whenLabel: g.nextDrawAt === null ? "—" : formatWhenLabel(g.nextDrawAt),
      pendingStake: g.totalPendingStake,
    }));
    // Ưu tiên game đang cần chú ý nhất lên đầu: đang mở (tần suất thấp + cao) trước, rồi mới tới
    // vừa hoàn thành/sắp diễn ra — staff hỏi "kỳ nào đang mở" là câu hỏi phổ biến nhất (§2.1).
    const active = eventRows.filter((r) => r.statusLabel === EVENT_STATUS_LABELS.active);
    const rest = eventRows.filter((r) => r.statusLabel !== EVENT_STATUS_LABELS.active);
    return [...active, ...highFreqRows, ...rest];
  },
  view: {
    kind: "table",
    title: "Bức tranh kỳ quay",
    totals: [{ key: "pendingStake", label: "Tổng cược treo" }],
    columns: [
      { key: "gameLabel", label: "Game" },
      { key: "statusLabel", label: "Trạng thái" },
      { key: "drawLabel", label: "Kỳ" },
      { key: "whenLabel", label: "Thời điểm" },
      { key: "pendingStake", label: "Cược treo", format: CellFormat.VndCompact },
    ],
    maxRows: 14,
    link: { label: "Mở dashboard vận hành", href: () => "/dashboard" },
    empty: "Không lấy được bức tranh kỳ quay hiện tại.",
  },
});
