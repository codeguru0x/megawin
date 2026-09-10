/**
 * Ops Hub — Chia + filter + sort cho CẢ HAI bảng (5A/5B) trong 1 lần lặp (plan §6.1).
 *
 * `derived.rows` (từ p1-01 `deriveHubSummary`) đã có `gate`/`stage`/`health`/`ageInStageSec` —
 * file này KHÔNG dẫn xuất lại. Ở đây chỉ: chia theo `gate`, filter theo tab 5A, sort, và chọn
 * top-N outlier 5B. Viết `rows.filter(...)` nhiều lần cho 5A/5B/top-N là 3-4 lần lặp
 * (`vercel-react-best-practices` §7.6) — gộp 1 vòng `for`.
 */

import { OpsStage, SaleGate, StageHealth } from "../../derive-draw-state";
import type { DerivedRow } from "../../hub-types";
import { HubGateTab, QueueSortDir, QueueSortKey } from "./queue-types";

/** Rank số cho `health` — sort PHẢI dùng rank, so string sẽ ra alphabet `ok > warn > stuck`
 * (ngược hoàn toàn ý nghĩa, trông vẫn "chạy được" — plan §4.2 cảnh báo rõ). */
const HEALTH_RANK: Record<string, number> = {
  [StageHealth.Stuck]: 2,
  [StageHealth.Warn]: 1,
  [StageHealth.Ok]: 0,
};

/** `true` khi dòng khớp tab đang chọn — mỗi tab map ĐÚNG 1 trạng thái (p1-08 §7: bỏ tab "Cần
 * xử lý" gộp nhiều trạng thái khác action, tránh bulk sai). `All` không lọc. */
function matchesTab(row: DerivedRow, tab: HubGateTab): boolean {
  switch (tab) {
    case HubGateTab.PendingOpen:
      // `NeverOpened` gộp chung tab này (không tab riêng): còn kịp mở bán vs quá giờ
      // chỉ còn huỷ — phân biệt bằng badge `OPS_STAGE_LABEL.never_opened`, không bằng tab.
      return row.gate === SaleGate.PendingOpen || row.gate === SaleGate.Halted || row.stage === OpsStage.NeverOpened;
    case HubGateTab.Ended:
      return row.stage === OpsStage.PendingClose;
    case HubGateTab.AwaitingResult:
      return row.stage === OpsStage.AwaitingDraw || row.stage === OpsStage.AwaitingResult;
    case HubGateTab.AwaitingSettle:
      return row.stage === OpsStage.AwaitingSettle || row.stage === OpsStage.NeedsResettle;
    case HubGateTab.All:
      return true;
    default: {
      const _exhaustive: never = tab;
      return _exhaustive;
    }
  }
}

function compareRows(a: DerivedRow, b: DerivedRow, sortKey: QueueSortKey, dir: QueueSortDir): number {
  let cmp = 0;
  switch (sortKey) {
    case QueueSortKey.Health:
      cmp = (HEALTH_RANK[a.health] ?? 0) - (HEALTH_RANK[b.health] ?? 0);
      if (cmp === 0) {
        cmp = (a.ageInStageSec ?? 0) - (b.ageInStageSec ?? 0);
      }
      break;
    case QueueSortKey.AgeInStage:
      cmp = (a.ageInStageSec ?? 0) - (b.ageInStageSec ?? 0);
      break;
    case QueueSortKey.Revenue:
      cmp = a.revenue - b.revenue;
      break;
    case QueueSortKey.DrawTime:
      cmp = a.ts.drawTimeMs - b.ts.drawTimeMs;
      break;
    default: {
      const _exhaustive: never = sortKey;
      return _exhaustive;
    }
  }
  return dir === QueueSortDir.Desc ? -cmp : cmp;
}

/** Đếm dòng theo từng tab — hiện badge số trên tab, tính từ `derived.rows` CÓ SẴN (plan §4.1: "không query thêm"). */
export function countRowsByTab(rows: readonly DerivedRow[]): Record<HubGateTab, number> {
  const counts: Record<HubGateTab, number> = {
    [HubGateTab.PendingOpen]: 0,
    [HubGateTab.Ended]: 0,
    [HubGateTab.AwaitingResult]: 0,
    [HubGateTab.AwaitingSettle]: 0,
    [HubGateTab.All]: 0,
  };
  for (const row of rows) {
    if (row.gate === SaleGate.Open) {
      continue;
    }
    if (row.gate === SaleGate.PendingOpen || row.gate === SaleGate.Halted || row.stage === OpsStage.NeverOpened) {
      counts[HubGateTab.PendingOpen] += 1;
    }
    if (row.stage === OpsStage.PendingClose) {
      counts[HubGateTab.Ended] += 1;
    }
    if (row.stage === OpsStage.AwaitingDraw || row.stage === OpsStage.AwaitingResult) {
      counts[HubGateTab.AwaitingResult] += 1;
    }
    if (row.stage === OpsStage.AwaitingSettle || row.stage === OpsStage.NeedsResettle) {
      counts[HubGateTab.AwaitingSettle] += 1;
    }
    counts[HubGateTab.All] += 1;
  }
  return counts;
}

/** Sort mặc định theo tab đang chọn (guideline §5.2, plan §4.2) — khi user chưa tự đổi sort.
 * `PendingOpen` (mới, p1-08 §7) ưu tiên sort theo sức khoẻ giống tab cũ "Cần xử lý" — kỳ càng
 * lâu chưa mở bán/càng nghiêm trọng càng cần xử lý trước. */
export function defaultSortForTab(tab: HubGateTab): { sortKey: QueueSortKey; dir: QueueSortDir } {
  if (tab === HubGateTab.PendingOpen) {
    return { sortKey: QueueSortKey.Health, dir: QueueSortDir.Desc };
  }
  if (tab === HubGateTab.All) {
    return { sortKey: QueueSortKey.DrawTime, dir: QueueSortDir.Asc };
  }
  return { sortKey: QueueSortKey.AgeInStage, dir: QueueSortDir.Desc };
}

export interface QueueTablesResult {
  /** Bảng 5A đã filter theo tab + sort — nguồn render CHÍNH của Zone 5A. */
  rows5A: DerivedRow[];
  /** Toàn bộ dòng `gate = Open`, sort theo `closeAtMs` tăng dần (kỳ sắp đóng bán sớm nhất lên
   * đầu — p1-07 §10 mục 7) — dùng để tính outlier + đếm Lớp 3. */
  rows5B: DerivedRow[];
}

/**
 * Chia `derived.rows` thành 5A (đã filter tab + sort) và 5B (toàn bộ `gate = Open`) trong
 * ĐÚNG 1 lần lặp qua `rows` (plan §6.1) — không gọi `.filter()` rời cho từng nhóm.
 *
 * KHÔNG tính `tabCounts` ở đây (khác bản trước p1-08) — caller (`use-hub-context.tsx`) cần
 * `tabCounts` TRƯỚC KHI biết `tab` (để tính tab mặc định theo count, §9 Q2), nên đã tách
 * `countRowsByTab` ra gọi riêng 1 lần, không lặp lại trong hàm này.
 */
export function buildQueueTables(
  rows: readonly DerivedRow[],
  tab: HubGateTab,
  sortKey: QueueSortKey,
  dir: QueueSortDir,
): QueueTablesResult {
  const rows5A: DerivedRow[] = [];
  const rows5B: DerivedRow[] = [];

  for (const row of rows) {
    if (row.gate === SaleGate.Open) {
      rows5B.push(row);
      continue;
    }
    if (matchesTab(row, tab)) {
      rows5A.push(row);
    }
  }

  // Sort TƯỜNG MINH theo `closeAtMs` tăng dần (p1-07 §6, chốt §10 mục 7) — kỳ SẮP đóng bán
  // sớm nhất lên đầu. TRƯỚC ĐÓ dựa vào thứ tự ngầm định của `rows` (đến từ snapshot theo
  // `drawTimeMs`) — tình cờ đúng hướng nhưng KHÔNG tường minh, dễ vỡ khi nguồn dữ liệu đổi thứ
  // tự (review 08/09: "kỳ đang bán gần nhất lại xuống dưới cùng" — user quan sát đúng lúc thứ
  // tự ngầm định không khớp kỳ vọng). `toSorted()` không mutate `rows5B` gốc (đã push riêng).
  const rows5BSorted = rows5B.toSorted((a, b) => a.ts.closeAtMs - b.ts.closeAtMs);

  // `toSorted()` KHÔNG `sort()`: `rows` thuộc React Query cache, `sort()` mutate nó
  // (`vercel-react-best-practices` §7.12) → `keepPreviousData` trả mảng đã bị xáo trộn ở lần
  // render sau (plan §6.1).
  const sorted5A = rows5A.toSorted((a, b) => compareRows(a, b, sortKey, dir));

  return { rows5A: sorted5A, rows5B: rows5BSorted };
}
